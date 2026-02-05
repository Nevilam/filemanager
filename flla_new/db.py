"""
db.py — простая обёртка для SQLite для file-sharing схемы.
Метод Database.init_db() создаёт таблицы (читает schema.sql если он рядом).
"""
import sqlite3
import time
import uuid
from typing import Optional, Tuple, Dict, List

from werkzeug.security import generate_password_hash, check_password_hash

class Database:
    def __init__(self, path: str = "data/app.db"):
        self.path = path

    def get_conn(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.path, timeout=10)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        return conn

    def init_db(self) -> None:
        import os
        schema_path = os.path.join(os.path.dirname(__file__), "schema.sql")
        if os.path.exists(schema_path):
            with open(schema_path, "r", encoding="utf-8") as f:
                schema = f.read()
            with self.get_conn() as conn:
                conn.executescript(schema)
            return
        with self.get_conn() as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    username TEXT UNIQUE NOT NULL,
                    password_hash TEXT NOT NULL,
                    email TEXT,
                    created_at INTEGER NOT NULL
                )
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS tokens (
                    token TEXT PRIMARY KEY,
                    user_id INTEGER NOT NULL,
                    expires_at INTEGER NOT NULL,
                    created_at INTEGER NOT NULL,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                )
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS files (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    owner_id INTEGER NOT NULL,
                    filename_orig TEXT NOT NULL,
                    filename_stored TEXT NOT NULL,
                    size INTEGER NOT NULL,
                    mime TEXT,
                    created_at INTEGER NOT NULL,
                    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
                )
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS shares (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    file_id INTEGER NOT NULL,
                    recipient_user_id INTEGER NOT NULL,
                    shared_by_id INTEGER NOT NULL,
                    created_at INTEGER NOT NULL,
                    FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE,
                    FOREIGN KEY (recipient_user_id) REFERENCES users(id) ON DELETE CASCADE
                )
            """)

    # ---- users ----
    def create_user(self, username: str, password: str, email: Optional[str]) -> Optional[int]:
        pwd_hash = generate_password_hash(password)
        now = int(time.time())
        try:
            with self.get_conn() as conn:
                cur = conn.execute(
                    "INSERT INTO users (username, password_hash, email, created_at) VALUES (?, ?, ?, ?)",
                    (username, pwd_hash, email, now)
                )
                return cur.lastrowid
        except sqlite3.IntegrityError:
            return None

    def find_user_by_username(self, username: str) -> Optional[sqlite3.Row]:
        with self.get_conn() as conn:
            cur = conn.execute("SELECT * FROM users WHERE username = ?", (username,))
            return cur.fetchone()

    def find_user_by_id(self, user_id: int) -> Optional[sqlite3.Row]:
        with self.get_conn() as conn:
            cur = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,))
            return cur.fetchone()

    def verify_user_password(self, username: str, password: str) -> Optional[int]:
        row = self.find_user_by_username(username)
        if not row:
            return None
        if check_password_hash(row["password_hash"], password):
            return row["id"]
        return None

    # ---- tokens ----
    def create_token_for_user(self, user_id: int, ttl_seconds: int = 30 * 24 * 3600) -> Tuple[str, int]:
        token = uuid.uuid4().hex
        now = int(time.time())
        expires = now + ttl_seconds
        with self.get_conn() as conn:
            conn.execute(
                "INSERT INTO tokens (token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)",
                (token, user_id, expires, now)
            )
        return token, expires

    def revoke_token(self, token: str) -> None:
        with self.get_conn() as conn:
            conn.execute("DELETE FROM tokens WHERE token = ?", (token,))

    def get_user_by_token(self, token: str) -> Optional[sqlite3.Row]:
        if not token:
            return None
        now = int(time.time())
        with self.get_conn() as conn:
            cur = conn.execute("SELECT t.user_id, t.expires_at FROM tokens t WHERE t.token = ?", (token,))
            row = cur.fetchone()
            if not row:
                return None
            if row["expires_at"] < now:
                conn.execute("DELETE FROM tokens WHERE token = ?", (token,))
                return None
            return self.find_user_by_id(row["user_id"])

    # ---- files ----
    def create_file_entry(self, owner_id: int, filename_orig: str, filename_stored: str, size: int, mime: Optional[str]) -> int:
        now = int(time.time())
        with self.get_conn() as conn:
            cur = conn.execute(
                "INSERT INTO files (owner_id, filename_orig, filename_stored, size, mime, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                (owner_id, filename_orig, filename_stored, size, mime, now)
            )
            return cur.lastrowid

    def add_share(self, file_id: int, recipient_user_id: int, shared_by_id: int) -> int:
        now = int(time.time())
        with self.get_conn() as conn:
            cur = conn.execute(
                "INSERT INTO shares (file_id, recipient_user_id, shared_by_id, created_at) VALUES (?, ?, ?, ?)",
                (file_id, recipient_user_id, shared_by_id, now)
            )
            return cur.lastrowid

    def user_can_access_file(self, user_id: int, file_id: int) -> bool:
        with self.get_conn() as conn:
            cur = conn.execute("SELECT owner_id FROM files WHERE id = ?", (file_id,))
            row = cur.fetchone()
            if not row:
                return False
            if row["owner_id"] == user_id:
                return True
            cur = conn.execute("SELECT 1 FROM shares WHERE file_id = ? AND recipient_user_id = ?", (file_id, user_id))
            return cur.fetchone() is not None

    def get_file_metadata(self, file_id: int) -> Optional[sqlite3.Row]:
        with self.get_conn() as conn:
            cur = conn.execute("SELECT * FROM files WHERE id = ?", (file_id,))
            return cur.fetchone()

    def list_files_for_user(self, user_id: int) -> Dict[str, List[Dict]]:
        with self.get_conn() as conn:
            cur = conn.execute("""
                SELECT f.id, f.filename_orig, f.size, f.mime, f.created_at, u.username AS owner
                FROM files f JOIN users u ON u.id = f.owner_id
                WHERE f.owner_id = ?
                ORDER BY f.created_at DESC
            """, (user_id,))
            owned = [dict(r) for r in cur.fetchall()]

            cur = conn.execute("""
                SELECT f.id, f.filename_orig, f.size, f.mime, f.created_at, u.username AS owner
                FROM files f
                JOIN users u ON u.id = f.owner_id
                JOIN shares s ON s.file_id = f.id
                WHERE s.recipient_user_id = ?
                AND f.owner_id != ?
                ORDER BY f.created_at DESC
            """, (user_id, user_id))
            shared = [dict(r) for r in cur.fetchall()]

        return {"owned": owned, "shared": shared}