import os
import requests
import json

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
    "Content-Type": "application/json"
}

# 1. Try to find any existing record by guessing names
cols_to_test = ["sync_name", "last_run_at", "last_run_source", "sync_source", "source", "origin"]
print(f"Testing columns in dashboard_sync_status...")

for col in cols_to_test:
    response = requests.get(f"{url}/rest/v1/dashboard_sync_status?select={col}&limit=1", headers=headers)
    if response.status_code == 200:
        print(f"Column '{col}' EXISTS.")
    else:
        print(f"Column '{col}' DOES NOT exist.")

