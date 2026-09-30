"""
Run this script inside your venv to generate a fresh bcrypt hash
for any password, then paste it into the INSERT statement in
admin_credentials.sql.

Usage:
  cd backend
  python generate_hash.py
"""

from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

passwords = {
    "admin@partora.com": "Admin@1234",
    "staff@partora.com": "Staff@1234",
}

for email, pw in passwords.items():
    hashed = pwd_context.hash(pw)
    print(f"\n-- {email}  (password: {pw})")
    print(f"-- Hash: {hashed}")