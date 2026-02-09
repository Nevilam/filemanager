import os
import secrets
import sqlite3
import time
from functools import wraps
from pathlib import Path
from typing import Any, Dict, Optional, TypedDict

from flask import Flask, g, jsonify, request, send_file, send_from_directory
from werkzeug.security import check_password_hash, generate_password_hash

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
UPLOAD_DIR = DATA_DIR / "uploads"
DB_PATH = DATA_DIR / "app.db"
FRONTEND_DIST = BASE_DIR.parent / "frontend" / "dist"
TOKEN_TTL_SECONDS = 30 * 24 * 3600
SHARE_CODE_BYTES = 8
MAX_SHARE_CODE_ATTEMPTS = 50

ALLOWED_ORIGINS = {
    "http://localhost:5173",
    "http://127.0.0.1:5173",
}

app = Flask(__name__)


class AuthUser(TypedDict):
    id: int
    username: str
    email: str


def ensure_dirs() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


def get_db() -> sqlite3.Connection:
    conn = getattr(g, "_db_conn", None)
    if conn is None:
        conn = sqlite3.connect(DB_PATH, timeout=10)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        g._db_conn = conn
    return conn


@app.teardown_appcontext
def close_db(_: Optional[BaseException]) -> None:
    conn = getattr(g, "_db_conn", None)
    if conn is not None:
        conn.close()


def now_ts() -> int:
    return int(time.time())


def create_share_code(conn: sqlite3.Connection) -> str:
    for _ in range(MAX_SHARE_CODE_ATTEMPTS):
        code = secrets.token_hex(SHARE_CODE_BYTES)
        row = conn.execute("SELECT id FROM items WHERE share_code = ?", (code,)).fetchone()
        if row is None:
            return code
    raise RuntimeError("Could not generate unique share code")


def cleanup_legacy_schema(conn: sqlite3.Connection) -> None:
    conn.execute("DROP TABLE IF EXISTS shares")


def migrate_schema(conn: sqlite3.Connection) -> None:
    columns = conn.execute("PRAGMA table_info(items)").fetchall()
    column_names = {str(column[1]) for column in columns}

    if "share_code" not in column_names:
        conn.execute("ALTER TABLE items ADD COLUMN share_code TEXT")

    if "is_private" not in column_names:
        conn.execute("ALTER TABLE items ADD COLUMN is_private INTEGER NOT NULL DEFAULT 1")

    conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_items_share_code ON items(share_code)")

    file_rows = conn.execute(
        "SELECT id FROM items WHERE item_type = 'file' AND (share_code IS NULL OR share_code = '')"
    ).fetchall()
    for file_row in file_rows:
        code = create_share_code(conn)
        conn.execute(
            "UPDATE items SET share_code = ? WHERE id = ?",
            (code, int(file_row[0])),
        )

    conn.execute(
        "UPDATE items SET is_private = 1 WHERE item_type = 'file' AND is_private IS NULL"
    )


def init_db() -> None:
    ensure_dirs()
    schema = """
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        email TEXT NOT NULL,
        created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tokens (
        token TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        owner_id INTEGER NOT NULL,
        parent_id INTEGER,
        name TEXT NOT NULL,
        item_type TEXT NOT NULL CHECK (item_type IN ('file', 'folder')),
        stored_name TEXT,
        size INTEGER NOT NULL DEFAULT 0,
        mime TEXT,
        share_code TEXT,
        is_private INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (parent_id) REFERENCES items(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_items_owner_parent ON items(owner_id, parent_id);
    """

    with sqlite3.connect(DB_PATH, timeout=10) as conn:
        conn.execute("PRAGMA foreign_keys = ON")
        conn.executescript(schema)
        cleanup_legacy_schema(conn)
        migrate_schema(conn)
        conn.commit()


def parse_parent_id(raw_value: Optional[str]) -> Optional[int]:
    if raw_value in (None, "", "null", "None"):
        return None
    parent_id = int(raw_value)
    if parent_id <= 0:
        raise ValueError("parentId must be positive")
    return parent_id


def to_item_payload(row: sqlite3.Row) -> Dict[str, Any]:
    return {
        "id": str(row["id"]),
        "name": row["name"],
        "type": row["item_type"],
        "parentId": str(row["parent_id"]) if row["parent_id"] is not None else None,
        "size": int(row["size"] or 0),
        "shareCode": row["share_code"] if row["item_type"] == "file" else None,
        "isPrivate": bool(row["is_private"]) if row["item_type"] == "file" else True,
    }


def make_error(message: str, status: int):
    return jsonify({"ok": False, "error": message}), status


def get_public_base_url() -> str:
    configured = os.getenv("PUBLIC_BASE_URL", "").strip().rstrip("/")
    if configured:
        return configured

    origin = request.headers.get("Origin", "").strip().rstrip("/")
    if origin:
        return origin

    return request.host_url.rstrip("/")


def extract_token() -> Optional[str]:
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        return None
    return header.replace("Bearer ", "", 1).strip() or None


def get_user_by_token(token: str) -> Optional[sqlite3.Row]:
    now = now_ts()
    conn = get_db()
    row = conn.execute(
        """
        SELECT u.id, u.username, u.email, t.expires_at
        FROM tokens t
        JOIN users u ON u.id = t.user_id
        WHERE t.token = ?
        """,
        (token,),
    ).fetchone()
    if not row:
        return None
    if row["expires_at"] < now:
        conn.execute("DELETE FROM tokens WHERE token = ?", (token,))
        conn.commit()
        return None
    return row


def require_auth(func):
    @wraps(func)
    def wrapper(*args, **kwargs):
        token = extract_token()
        if not token:
            return make_error("Unauthorized", 401)
        user = get_user_by_token(token)
        if not user:
            return make_error("Unauthorized", 401)
        g.current_user = {
            "id": int(user["id"]),
            "username": user["username"],
            "email": user["email"],
        }
        return func(*args, **kwargs)

    return wrapper


def create_token(user_id: int) -> Dict[str, Any]:
    now = now_ts()
    expires_at = now + TOKEN_TTL_SECONDS
    token = secrets.token_hex(24)
    conn = get_db()
    conn.execute(
        "INSERT INTO tokens (token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)",
        (token, user_id, expires_at, now),
    )
    conn.commit()
    return {"token": token, "expiresAt": expires_at}


def get_owner_item(owner_id: int, item_id: int) -> Optional[sqlite3.Row]:
    return get_db().execute(
        "SELECT * FROM items WHERE id = ? AND owner_id = ?",
        (item_id, owner_id),
    ).fetchone()


def get_public_file_by_code(share_code: str) -> Optional[sqlite3.Row]:
    return get_db().execute(
        """
        SELECT i.*, u.username AS owner_username
        FROM items i
        JOIN users u ON u.id = i.owner_id
        WHERE i.item_type = 'file' AND i.share_code = ?
        """,
        (share_code,),
    ).fetchone()


@app.before_request
def handle_preflight():
    if request.method == "OPTIONS":
        return ("", 204)
    return None


@app.after_request
def add_cors_headers(response):
    origin = request.headers.get("Origin")
    if origin in ALLOWED_ORIGINS:
        response.headers["Access-Control-Allow-Origin"] = origin
    else:
        response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, PATCH, DELETE, OPTIONS"
    return response


@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({"ok": True, "message": "file sharing server is running"})


@app.route("/api/auth/register", methods=["POST"])
def register():
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""
    email = (data.get("email") or "").strip()

    if not username or not password or not email:
        return make_error("Required fields: username, password, email", 400)

    conn = get_db()
    exists = conn.execute("SELECT id FROM users WHERE username = ?", (username,)).fetchone()
    if exists:
        return make_error("Username already taken", 409)

    now = now_ts()
    password_hash = generate_password_hash(password)
    cur = conn.execute(
        "INSERT INTO users (username, password_hash, email, created_at) VALUES (?, ?, ?, ?)",
        (username, password_hash, email, now),
    )
    conn.commit()

    user_id = int(cur.lastrowid)
    token_data = create_token(user_id)

    return (
        jsonify(
            {
                "ok": True,
                "token": token_data["token"],
                "expiresAt": token_data["expiresAt"],
                "user": {
                    "id": str(user_id),
                    "username": username,
                    "email": email,
                },
            }
        ),
        201,
    )


@app.route("/api/auth/login", methods=["POST"])
def login():
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""

    if not username or not password:
        return make_error("Required fields: username, password", 400)

    conn = get_db()
    user = conn.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
    if not user or not check_password_hash(user["password_hash"], password):
        return make_error("Invalid username or password", 401)

    token_data = create_token(int(user["id"]))
    return jsonify(
        {
            "ok": True,
            "token": token_data["token"],
            "expiresAt": token_data["expiresAt"],
            "user": {
                "id": str(user["id"]),
                "username": user["username"],
                "email": user["email"],
            },
        }
    )


@app.route("/api/auth/me", methods=["GET"])
@require_auth
def me():
    user: AuthUser = g.current_user
    return jsonify(
        {
            "ok": True,
            "user": {
                "id": str(user["id"]),
                "username": user["username"],
                "email": user["email"],
            },
        }
    )


@app.route("/api/auth/logout", methods=["POST"])
@require_auth
def logout():
    token = extract_token()
    if token:
        conn = get_db()
        conn.execute("DELETE FROM tokens WHERE token = ?", (token,))
        conn.commit()
    return jsonify({"ok": True})


@app.route("/api/files", methods=["GET"])
@require_auth
def list_files():
    user: AuthUser = g.current_user
    try:
        parent_id = parse_parent_id(request.args.get("parentId"))
    except ValueError as exc:
        return make_error(str(exc), 400)

    conn = get_db()
    current_folder = None

    if parent_id is not None:
        folder = get_owner_item(user["id"], parent_id)
        if not folder or folder["item_type"] != "folder":
            return make_error("Folder not found", 404)
        current_folder = {
            "id": str(folder["id"]),
            "name": folder["name"],
            "parentId": str(folder["parent_id"]) if folder["parent_id"] is not None else None,
        }

    if parent_id is None:
        rows = conn.execute(
            """
            SELECT *
            FROM items
            WHERE owner_id = ? AND parent_id IS NULL
            ORDER BY CASE WHEN item_type = 'folder' THEN 0 ELSE 1 END, name COLLATE NOCASE
            """,
            (user["id"],),
        ).fetchall()
    else:
        rows = conn.execute(
            """
            SELECT *
            FROM items
            WHERE owner_id = ? AND parent_id = ?
            ORDER BY CASE WHEN item_type = 'folder' THEN 0 ELSE 1 END, name COLLATE NOCASE
            """,
            (user["id"], parent_id),
        ).fetchall()

    return jsonify(
        {
            "ok": True,
            "items": [to_item_payload(row) for row in rows],
            "currentFolder": current_folder,
        }
    )


@app.route("/api/folders", methods=["POST"])
@require_auth
def create_folder():
    user: AuthUser = g.current_user
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip() or "Новая папка"

    try:
        parent_id = parse_parent_id(data.get("parentId"))
    except ValueError as exc:
        return make_error(str(exc), 400)

    if parent_id is not None:
        parent = get_owner_item(user["id"], parent_id)
        if not parent or parent["item_type"] != "folder":
            return make_error("Parent folder not found", 404)

    now = now_ts()
    conn = get_db()
    cur = conn.execute(
        "INSERT INTO items (owner_id, parent_id, name, item_type, created_at) VALUES (?, ?, ?, 'folder', ?)",
        (user["id"], parent_id, name, now),
    )
    conn.commit()

    folder_id = int(cur.lastrowid)
    row = get_owner_item(user["id"], folder_id)
    if not row:
        return make_error("Could not create folder", 500)

    return jsonify({"ok": True, "item": to_item_payload(row)})


@app.route("/api/files/upload", methods=["POST"])
@require_auth
def upload_file():
    user: AuthUser = g.current_user
    file = request.files.get("file")
    if file is None or not file.filename:
        return make_error("file is required", 400)

    try:
        parent_id = parse_parent_id(request.form.get("parentId"))
    except ValueError as exc:
        return make_error(str(exc), 400)

    if parent_id is not None:
        parent = get_owner_item(user["id"], parent_id)
        if not parent or parent["item_type"] != "folder":
            return make_error("Parent folder not found", 404)

    safe_name = Path(file.filename).name
    ext = Path(safe_name).suffix
    stored_name = f"{now_ts()}_{secrets.token_hex(8)}{ext}"
    stored_path = UPLOAD_DIR / stored_name

    file.save(stored_path)
    size = stored_path.stat().st_size
    mime = file.mimetype or "application/octet-stream"

    now = now_ts()
    conn = get_db()
    share_code = create_share_code(conn)
    cur = conn.execute(
        """
        INSERT INTO items (
            owner_id, parent_id, name, item_type, stored_name, size, mime, share_code, is_private, created_at
        )
        VALUES (?, ?, ?, 'file', ?, ?, ?, ?, 1, ?)
        """,
        (user["id"], parent_id, safe_name, stored_name, size, mime, share_code, now),
    )
    conn.commit()

    item_id = int(cur.lastrowid)
    row = get_owner_item(user["id"], item_id)
    if not row:
        return make_error("Could not save file metadata", 500)

    return jsonify({"ok": True, "item": to_item_payload(row)})


@app.route("/api/items/<int:item_id>", methods=["PATCH"])
@require_auth
def rename_item(item_id: int):
    user: AuthUser = g.current_user
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    if not name:
        return make_error("name is required", 400)

    row = get_owner_item(user["id"], item_id)
    if not row:
        return make_error("Item not found", 404)

    conn = get_db()
    conn.execute(
        "UPDATE items SET name = ? WHERE id = ? AND owner_id = ?",
        (name, item_id, user["id"]),
    )
    conn.commit()

    updated = get_owner_item(user["id"], item_id)
    if not updated:
        return make_error("Item not found", 404)
    return jsonify({"ok": True, "item": to_item_payload(updated)})


@app.route("/api/items/<int:item_id>/privacy", methods=["PATCH"])
@require_auth
def update_privacy(item_id: int):
    user: AuthUser = g.current_user
    data = request.get_json(silent=True) or {}

    if "isPrivate" not in data or not isinstance(data["isPrivate"], bool):
        return make_error("isPrivate (boolean) is required", 400)

    row = get_owner_item(user["id"], item_id)
    if not row:
        return make_error("Item not found", 404)

    if row["item_type"] != "file":
        return make_error("Privacy can be changed only for files", 400)

    conn = get_db()
    conn.execute(
        "UPDATE items SET is_private = ? WHERE id = ? AND owner_id = ?",
        (1 if data["isPrivate"] else 0, item_id, user["id"]),
    )
    conn.commit()

    updated = get_owner_item(user["id"], item_id)
    if not updated:
        return make_error("Item not found", 404)

    return jsonify({"ok": True, "item": to_item_payload(updated)})


@app.route("/api/items/<int:item_id>", methods=["DELETE"])
@require_auth
def delete_item(item_id: int):
    user: AuthUser = g.current_user
    conn = get_db()

    target = get_owner_item(user["id"], item_id)
    if not target:
        return make_error("Item not found", 404)

    file_rows = conn.execute(
        """
        WITH RECURSIVE tree(id) AS (
            SELECT id FROM items WHERE id = ? AND owner_id = ?
            UNION ALL
            SELECT i.id
            FROM items i
            JOIN tree t ON i.parent_id = t.id
            WHERE i.owner_id = ?
        )
        SELECT stored_name FROM items
        WHERE id IN (SELECT id FROM tree)
        AND item_type = 'file'
        """,
        (item_id, user["id"], user["id"]),
    ).fetchall()

    conn.execute(
        """
        WITH RECURSIVE tree(id) AS (
            SELECT id FROM items WHERE id = ? AND owner_id = ?
            UNION ALL
            SELECT i.id
            FROM items i
            JOIN tree t ON i.parent_id = t.id
            WHERE i.owner_id = ?
        )
        DELETE FROM items WHERE id IN (SELECT id FROM tree)
        """,
        (item_id, user["id"], user["id"]),
    )
    conn.commit()

    for row in file_rows:
        stored_name = row["stored_name"]
        if not stored_name:
            continue
        file_path = UPLOAD_DIR / stored_name
        if file_path.exists():
            file_path.unlink(missing_ok=True)

    return jsonify({"ok": True})


@app.route("/api/items/<int:item_id>/share", methods=["POST"])
@require_auth
def get_share_link(item_id: int):
    user: AuthUser = g.current_user
    conn = get_db()

    row = get_owner_item(user["id"], item_id)
    if not row:
        return make_error("Item not found", 404)
    if row["item_type"] != "file":
        return make_error("Share link is available only for files", 400)

    share_code = row["share_code"]
    if not share_code:
        share_code = create_share_code(conn)
        conn.execute(
            "UPDATE items SET share_code = ? WHERE id = ? AND owner_id = ?",
            (share_code, item_id, user["id"]),
        )
        conn.commit()

    share_path = f"/share/{share_code}"
    base_url = get_public_base_url()
    return jsonify(
        {
            "ok": True,
            "shareCode": share_code,
            "isPrivate": bool(row["is_private"]),
            "sharePath": share_path,
            "shareUrl": f"{base_url}{share_path}",
        }
    )


@app.route("/api/files/<int:item_id>/download", methods=["GET"])
@require_auth
def download_own_file(item_id: int):
    user: AuthUser = g.current_user
    row = get_owner_item(user["id"], item_id)
    if not row or row["item_type"] != "file":
        return make_error("File not found", 404)

    stored_name = row["stored_name"]
    if not stored_name:
        return make_error("File storage error", 500)

    file_path = UPLOAD_DIR / stored_name
    if not file_path.exists():
        return make_error("File not found on disk", 404)

    return send_file(
        file_path,
        as_attachment=True,
        download_name=row["name"],
        mimetype=row["mime"] or "application/octet-stream",
    )


@app.route("/api/public/<share_code>", methods=["GET"])
def get_public_file(share_code: str):
    row = get_public_file_by_code(share_code)
    if not row:
        return make_error("File not found", 404)

    if bool(row["is_private"]):
        return make_error("This file is private", 403)

    return jsonify(
        {
            "ok": True,
            "file": {
                "id": str(row["id"]),
                "name": row["name"],
                "size": int(row["size"] or 0),
                "mime": row["mime"] or "application/octet-stream",
                "shareCode": row["share_code"],
                "owner": row["owner_username"],
                "createdAt": int(row["created_at"]),
            },
        }
    )


@app.route("/api/public/<share_code>/download", methods=["GET"])
def download_public_file(share_code: str):
    row = get_public_file_by_code(share_code)
    if not row:
        return make_error("File not found", 404)

    if bool(row["is_private"]):
        return make_error("This file is private", 403)

    stored_name = row["stored_name"]
    if not stored_name:
        return make_error("File storage error", 500)

    file_path = UPLOAD_DIR / stored_name
    if not file_path.exists():
        return make_error("File not found on disk", 404)

    return send_file(
        file_path,
        as_attachment=True,
        download_name=row["name"],
        mimetype=row["mime"] or "application/octet-stream",
    )


@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def serve_frontend(path: str):
    if path.startswith("api/"):
        return make_error("Not found", 404)

    if FRONTEND_DIST.exists():
        target = FRONTEND_DIST / path
        if path and target.exists() and target.is_file():
            return send_from_directory(FRONTEND_DIST, path)
        return send_from_directory(FRONTEND_DIST, "index.html")

    return jsonify(
        {
            "ok": True,
            "message": "Backend is running. Frontend build not found.",
            "hint": "Run: cd frontend && npm install && npm run build",
        }
    )


if __name__ == "__main__":
    init_db()
    host = os.getenv("FLASK_HOST", "0.0.0.0")
    port = int(os.getenv("FLASK_PORT", "5000"))
    debug_mode = os.getenv("FLASK_DEBUG", "0") == "1"
    app.run(host=host, port=port, debug=debug_mode)
