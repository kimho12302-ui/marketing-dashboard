import subprocess, json, time

token = "vcp_5rwOdO5aWnkkafJZVZRk3q5160xcVj08JO8b7zFeGcIyfNIKjB0tmfrx"
team_id = "team_pwM8l53dicCcgo4sXY0uuCte"
project_id = "prj_RzWsMM8p2gBSxhH5aC37cZIspGWX"

r = subprocess.run([
    "curl", "-s",
    f"https://api.vercel.com/v6/deployments?projectId={project_id}&teamId={team_id}&limit=3",
    "-H", f"Authorization: Bearer {token}",
], capture_output=True, text=True)
data = json.loads(r.stdout)
deploys = data.get('deployments', [])
if not deploys:
    print("No deployments yet")
else:
    for d in deploys:
        print(f"State: {d['state']:12} URL: {d['url']}")
