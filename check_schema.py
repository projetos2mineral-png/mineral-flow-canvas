import os
import requests
import json

url = os.environ.get("VITE_SUPABASE_URL")
key = os.environ.get("VITE_SUPABASE_ANON_KEY")

if not url or not key:
    print("Supabase credentials missing")
    exit(1)

# Try to query the table directly to see if it exists and what columns it has
query_url = f"{url}/rest/v1/dashboard_sync_status?select=*"
headers = {
    "apikey": key,
    "Authorization": f"Bearer {key}",
    "Content-Type": "application/json",
    "Prefer": "return=minimal"
}

try:
    # First, let's try to get a single row to see columns
    response = requests.get(f"{url}/rest/v1/dashboard_sync_status?limit=1", headers=headers)
    print(f"Status: {response.status_code}")
    if response.status_code == 200:
        data = response.json()
        if data:
            print(f"Sample row: {json.dumps(data[0], indent=2)}")
        else:
            print("Table exists but is empty.")
            # Try to get column names from options or another way if possible
    else:
        print(f"Error response: {response.text}")
except Exception as e:
    print(f"Exception: {e}")

