import os
import requests

env_vars = {}
with open(".env", "r") as f:
    for line in f:
        if "=" in line:
            parts = line.strip().split("=", 1)
            if len(parts) == 2:
                key, val = parts
                env_vars[key] = val.strip('"')

url = env_vars.get("VITE_SUPABASE_URL")
key = env_vars.get("VITE_SUPABASE_PUBLISHABLE_KEY")

headers = {
    "apikey": key,
    "Authorization": f"Bearer {key}",
    "Content-Type": "application/json",
    "Prefer": "return=representation"
}

# Try to insert as anon
data = {"sync_name": "test_sync", "last_run_at": "2026-08-19T00:00:00Z"}
response = requests.post(f"{url}/rest/v1/dashboard_sync_status", headers=headers, json=data)
print(f"Insert status: {response.status_code}")
print(f"Insert response: {response.text}")
