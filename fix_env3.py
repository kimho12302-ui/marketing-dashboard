import subprocess, json

token = "vcp_5rwOdO5aWnkkafJZVZRk3q5160xcVj08JO8b7zFeGcIyfNIKjB0tmfrx"
project_id = "prj_bKrPiUXjNmDdOYLjfiAdetXi382p"
team_id = "team_pwM8l53dicCcgo4sXY0uuCte"

# List and delete all env vars
r = subprocess.run([
    "curl", "-s",
    f"https://api.vercel.com/v9/projects/{project_id}/env?teamId={team_id}",
    "-H", f"Authorization: Bearer {token}",
], capture_output=True, text=True)
data = json.loads(r.stdout)
for env in data.get('envs', []):
    print(f"Deleting {env['key']} (id={env['id']}, len={len(env.get('value',''))})")
    subprocess.run([
        "curl", "-s", "-X", "DELETE",
        f"https://api.vercel.com/v9/projects/{project_id}/env/{env['id']}?teamId={team_id}",
        "-H", f"Authorization: Bearer {token}",
    ], capture_output=True)

# Add clean
envs = {
    "NEXT_PUBLIC_SUPABASE_URL": "https://phcfydxgwkmjiogerqmm.supabase.co",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBoY2Z5ZHhnd2ttamlvZ2VycW1tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1Njg4NjQsImV4cCI6MjA4OTE0NDg2NH0.M0ThTSK0kBvN71rccvzQpr3dQuL52oRs_Tj9MT7VWRg"
}
for key, value in envs.items():
    body = json.dumps({"key": key, "value": value, "type": "plain", "target": ["production", "preview", "development"]})
    r = subprocess.run([
        "curl", "-s", "-X", "POST",
        f"https://api.vercel.com/v10/projects/{project_id}/env?teamId={team_id}",
        "-H", f"Authorization: Bearer {token}",
        "-H", "Content-Type: application/json",
        "-d", body
    ], capture_output=True, text=True)
    resp = json.loads(r.stdout)
    if 'created' in resp:
        val = resp['created']['value']
        print(f"Added {key} (len={len(val)})")
    else:
        print(f"Failed {key}: {r.stdout[:200]}")

# Verify
r = subprocess.run([
    "curl", "-s",
    f"https://api.vercel.com/v9/projects/{project_id}/env?teamId={team_id}",
    "-H", f"Authorization: Bearer {token}",
], capture_output=True, text=True)
data = json.loads(r.stdout)
print(f"\nVerification: {len(data.get('envs',[]))} env vars")
for env in data.get('envs', []):
    print(f"  {env['key']}: len={len(env.get('value',''))}")
