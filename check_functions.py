import os
import requests

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
}

# List functions if possible via API (usually requires admin key, but let's see)
# Alternatively, check if we can fetch the source of a function via a hypothetical route
# Since we can't see the local files, we'll try to check the sync_status table more deeply

print("Checking dashboard_sync_status table rows:")
response = requests.get(f"{url}/rest/v1/dashboard_sync_status?select=*", headers=headers)
if response.status_code == 200:
    print(response.json())
else:
    print(f"Error: {response.status_code} - {response.text}")

