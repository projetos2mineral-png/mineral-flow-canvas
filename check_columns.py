import os
import requests
import json

env_vars = {}
with open(".env", "r") as f:
    for line in f:
        if "=" in line:
            key, val = line.strip().split("=", 1)
            env_vars[key] = val.strip('"')

url = env_vars.get("VITE_SUPABASE_URL")
key = env_vars.get("VITE_SUPABASE_PUBLISHABLE_KEY")

headers = {
    "apikey": key,
    "Authorization": f"Bearer {key}",
    "Content-Type": "application/json"
}

# Try to insert a dummy record and catch the error to see available columns if it fails
# or just try to select with a non-existent column to see error message
try:
    # Try selecting a column we know usually doesn't exist but might
    response = requests.get(f"{url}/rest/v1/dashboard_sync_status?select=sync_source", headers=headers)
    if response.status_code == 200:
        print("Column 'sync_source' exists.")
    else:
        print(f"Column 'sync_source' likely does not exist. Status: {response.status_code}")
        print(f"Response: {response.text}")

    # Check for sync_name and last_run_at
    response = requests.get(f"{url}/rest/v1/dashboard_sync_status?select=sync_name,last_run_at", headers=headers)
    if response.status_code == 200:
        print("Columns 'sync_name' and 'last_run_at' exist.")
    else:
        print(f"Error checking base columns: {response.text}")

except Exception as e:
    print(f"Exception: {e}")
