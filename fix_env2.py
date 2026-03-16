import subprocess, json

token = "vcp_5rwOdO5aWnkkafJZVZRk3q5160xcVj08JO8b7zFeGcIyfNIKjB0tmfrx"
project_id = "prj_bKrPiUXjNmDdOYLjfiAdetXi382p"
team_id = "team_pwM8l53dicCcgo4sXY0uuCte"

envs = {
    "NEXT_PUBLIC_SUPABASE_URL": "https://phcfydxgwkmjiogerqmm.supabase.co",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBoY2Z5ZHhnd2ttamlvZ2VycW1tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1Njg4NjQsImV4cCI6MjA4OTE0NDg2NH0.M0ThTSK0kBvN71rccvzQpr3dQuL52oRs_Tj9MT7VWRg"
}
for key, value in envs.items():
    body = json.dumps({
        "key": key,
        "value": value,
        "type": "plain",
        "target": ["production", "preview", "development"]
    })
    r = subprocess.run([
        "curl", "-s", "-X", "POST",
        f"https://api.vercel.com/v10/projects/{project_id}/env?teamId={team_id}",
        "-H", f"Authorization: Bearer {token}",
        "-H", "Content-Type: application/json",
        "-d", body
    ], capture_output=True, text=True)
    print(f"{key}: {r.stdout[:200]}")

# Trigger deploy via API
print("\nTriggering deployment...")
deploy_body = json.dumps({
    "name": "ppmi-dashboard",
    "project": project_id,
    "target": "production",
    "gitSource": {
        "type": "github",
        "repo": "kimho12302-ui/marketing-dashboard",
        "ref": "master"
    }
})
r = subprocess.run([
    "curl", "-s", "-X", "POST",
    f"https://api.vercel.com/v13/deployments?teamId={team_id}",
    "-H", f"Authorization: Bearer {token}",
    "-H", "Content-Type: application/json",
    "-d", deploy_body
], capture_output=True, text=True)
print(f"Deploy response: {r.stdout[:500]}")
