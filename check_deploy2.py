import subprocess, json

token = "vcp_5rwOdO5aWnkkafJZVZRk3q5160xcVj08JO8b7zFeGcIyfNIKjB0tmfrx"
team_id = "team_pwM8l53dicCcgo4sXY0uuCte"
project_id = "prj_RzWsMM8p2gBSxhH5aC37cZIspGWX"

r = subprocess.run([
    "curl", "-s",
    f"https://api.vercel.com/v6/deployments?projectId={project_id}&teamId={team_id}&limit=5",
    "-H", f"Authorization: Bearer {token}",
], capture_output=True, text=True)
data = json.loads(r.stdout)
deploys = data.get('deployments', [])
for d in deploys:
    meta = d.get('meta', {})
    source = meta.get('githubDeployment', 'cli')
    commit = meta.get('githubCommitMessage', 'N/A')[:40]
    print(f"State: {d['state']:12} Source: {str(source):6} Commit: {commit}")
    print(f"  URL: {d['url']}")
    if d['state'] == 'ERROR':
        # Get build logs
        r2 = subprocess.run([
            "curl", "-s",
            f"https://api.vercel.com/v2/deployments/{d['uid']}/events?teamId={team_id}",
            "-H", f"Authorization: Bearer {token}",
        ], capture_output=True, text=True)
        try:
            events = json.loads(r2.stdout)
            for e in events[-10:]:
                if e.get('type') == 'stderr' or 'error' in str(e.get('payload', {}).get('text', '')).lower():
                    print(f"  LOG: {e.get('payload', {}).get('text', '')[:200]}")
        except:
            print(f"  Events: {r2.stdout[:300]}")
