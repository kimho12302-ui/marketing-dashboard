import subprocess, json

token = "vcp_5rwOdO5aWnkkafJZVZRk3q5160xcVj08JO8b7zFeGcIyfNIKjB0tmfrx"
team_id = "team_pwM8l53dicCcgo4sXY0uuCte"

# List all projects
r = subprocess.run([
    "curl", "-s",
    f"https://api.vercel.com/v9/projects?teamId={team_id}",
    "-H", f"Authorization: Bearer {token}",
], capture_output=True, text=True)
data = json.loads(r.stdout)
projects = data.get('projects', [])
print(f"Found {len(projects)} projects:")
for p in projects:
    name = p.get('name', '?')
    pid = p.get('id', '?')
    repo = p.get('link', {}).get('repo', 'no repo')
    print(f"  {name} ({pid}) -> {repo}")

# Delete ALL projects
for p in projects:
    pid = p['id']
    name = p['name']
    print(f"\nDeleting {name}...")
    r = subprocess.run([
        "curl", "-s", "-X", "DELETE",
        f"https://api.vercel.com/v9/projects/{pid}?teamId={team_id}",
        "-H", f"Authorization: Bearer {token}",
    ], capture_output=True, text=True)
    if r.stdout.strip() == '':
        print(f"  Deleted!")
    else:
        print(f"  Response: {r.stdout[:200]}")

print("\nAll projects deleted. Creating fresh project...")

# Create new project linked to GitHub
create_body = json.dumps({
    "name": "ppmi-dashboard",
    "framework": "nextjs",
    "gitRepository": {
        "type": "github",
        "repo": "kimho12302-ui/marketing-dashboard"
    },
    "environmentVariables": [
        {"key": "NEXT_PUBLIC_SUPABASE_URL", "value": "https://phcfydxgwkmjiogerqmm.supabase.co", "type": "plain", "target": ["production", "preview", "development"]},
        {"key": "NEXT_PUBLIC_SUPABASE_ANON_KEY", "value": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBoY2Z5ZHhnd2ttamlvZ2VycW1tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1Njg4NjQsImV4cCI6MjA4OTE0NDg2NH0.M0ThTSK0kBvN71rccvzQpr3dQuL52oRs_Tj9MT7VWRg", "type": "plain", "target": ["production", "preview", "development"]}
    ]
})
r = subprocess.run([
    "curl", "-s", "-X", "POST",
    f"https://api.vercel.com/v10/projects?teamId={team_id}",
    "-H", f"Authorization: Bearer {token}",
    "-H", "Content-Type: application/json",
    "-d", create_body
], capture_output=True, text=True)
resp = json.loads(r.stdout)
if 'id' in resp:
    print(f"Project created: {resp['name']} ({resp['id']})")
    print(f"Repo linked: {resp.get('link', {}).get('repo', 'N/A')}")
else:
    print(f"Failed: {r.stdout[:500]}")
