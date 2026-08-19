import os
import requests
import json

# Read from .env manually since they are not in environment
env_vars = {}
try:
    with open(".env", "r") as f:
        for line in f:
            if "=" in line:
                key, val = line.strip().split("=", 1)
                env_vars[key] = val.strip('"')
except Exception:
    pass

url = env_vars.get("VITE_SUPABASE_URL")
key = env_vars.get("VITE_SUPABASE_PUBLISHABLE_KEY")

if not url or not key:
    print("Supabase credentials missing in .env")
    exit(1)

headers = {
    "apikey": key,
    "Authorization": f"Bearer {key}",
    "Content-Type": "application/json"
}

try:
    # Try to get a single row to see columns
    response = requests.get(f"{url}/rest/v1/dashboard_sync_status?limit=1", headers=headers)
    print(f"Status: {response.status_code}")
    if response.status_code == 200:
        data = response.json()
        if data:
            print(f"Sample row: {json.dumps(data[0], indent=2)}")
        else:
            print("Table exists but is empty.")
    else:
        print(f"Error response: {response.text}")
except Exception as e:
    print(f"Exception: {e}")

