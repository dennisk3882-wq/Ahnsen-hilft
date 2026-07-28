#!/usr/bin/env bash
set -euo pipefail

LOG_FILE="MATERIALIZE_FAILURE.log"
: > "$LOG_FILE"
exec > >(tee -a "$LOG_FILE") 2>&1

finish() {
  status=$?
  trap - EXIT
  if [ "$status" -ne 0 ]; then
    git config user.name 'github-actions[bot]'
    git config user.email '41898282+github-actions[bot]@users.noreply.github.com'
    git add "$LOG_FILE"
    git commit -m 'Protokolliere fehlgeschlagene Quiz-Materialisierung' || true
    git push origin HEAD:quiz-build-cleanup || true
  else
    rm -f "$LOG_FILE"
  fi
  exit "$status"
}
trap finish EXIT

cat \
  quiz-v6.b64.part00 quiz-v6.b64.part01 quiz-v6.b64.part02 \
  quiz-v6.b64.part03.0 quiz-v6.b64.part03.1 quiz-v6.b64.part03.2 \
  quiz-v6.b64.part04.0 quiz-v6.b64.part04.1 quiz-v6.b64.part04.2 \
  quiz-v6.b64.part05.0 quiz-v6.b64.part05.1 quiz-v6.b64.part05.2 \
  quiz-v6.b64.part06.0 quiz-v6.b64.part06.1 quiz-v6.b64.part06.2 \
  quiz-v6.b64.part07.0 quiz-v6.b64.part07.1 quiz-v6.b64.part07.2 \
  quiz-v6.b64.part08.0 quiz-v6.b64.part08.1 quiz-v6.b64.part08.2 \
  quiz-v6.b64.part09.0 quiz-v6.b64.part09.1 quiz-v6.b64.part09.2 \
  quiz-v6.b64.part10.0 quiz-v6.b64.part10.1 quiz-v6.b64.part10.2 \
  quiz-v6.b64.part11 \
  | tr -d '\r\n ' | base64 -d > /tmp/quiz-v6.tar.gz

echo '83984616269a7a898b112c9ca4cb61d606ab8b82ef1babfee3da4f15d0a18279  /tmp/quiz-v6.tar.gz' | sha256sum -c -
gzip -t /tmp/quiz-v6.tar.gz

rm -rf quiz-app
mkdir -p quiz-app
tar -xzf /tmp/quiz-v6.tar.gz -C quiz-app

cat \
  quiz-v6.1-patch.part00 quiz-v6.1-patch.part01 \
  quiz-v6.1-patch.part02_03 quiz-v6.1-patch.part04_05 \
  quiz-v6.1-patch.part06_07 quiz-v6.1-patch.part08_09 \
  quiz-v6.1-patch.part10_11 quiz-v6.1-patch.part12_13 \
  quiz-v6.1-patch.part14 quiz-v6.1-patch.part15 \
  | tr -d '\r\n ' | base64 -d > /tmp/quiz-v6.1-ui-patch.tar.gz

echo 'baa0485bd22861a6d9a7609db5b4c52c30c595eb4b776c879ec818568a073c4d  /tmp/quiz-v6.1-ui-patch.tar.gz' | sha256sum -c -
gzip -t /tmp/quiz-v6.1-ui-patch.tar.gz
tar -xzf /tmp/quiz-v6.1-ui-patch.tar.gz -C quiz-app

cat \
  quiz-v62x.part00 quiz-v62x.part01 quiz-v62x.part02 \
  quiz-v62x.part03_04 quiz-v62x.part05_06 quiz-v62x.part07_08 \
  quiz-v62x.part09_10 quiz-v62x.part11_12 quiz-v62x.part13_14 \
  | tr -d '\r\n ' | base64 -d > /tmp/quiz-v62-ui-patch.tar.xz

echo 'b8bcf5708285e3c81e27d709a13fd970dba6963cb68f6f9b8781b130b25145e2  /tmp/quiz-v62-ui-patch.tar.xz' | sha256sum -c -
xz -t /tmp/quiz-v62-ui-patch.tar.xz
tar -xJf /tmp/quiz-v62-ui-patch.tar.xz -C quiz-app

test -f quiz-app/server.js
test -f quiz-app/package.json
test -f quiz-app/public/js/admin.js
test -f quiz-app/public/js/player.js
test -f quiz-app/public/js/screen.js

mkdir -p quiz-app/tests
cp scripts/catalog-quality.test.js quiz-app/tests/catalog-quality.test.js

node <<'NODE'
const fs = require('fs');
const packagePath = 'quiz-app/package.json';
const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
packageJson.scripts = packageJson.scripts || {};
packageJson.scripts['test:catalog'] = 'node tests/catalog-quality.test.js';
packageJson.scripts['test:all'] = 'npm run check && npm run test:core && npm run test:catalog';
fs.writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);
NODE

cd quiz-app
npm install
npm run test:all
cd ..

cat > render.yaml <<'EOF'
services:
  - type: web
    name: ahnsen-live-quiz
    runtime: node
    region: frankfurt
    plan: free
    branch: ahnsen-live-quiz-online
    buildCommand: cd quiz-app && npm ci && npm run test:all
    startCommand: cd quiz-app && npm start
    healthCheckPath: /health
    autoDeploy: false
    envVars:
      - key: NODE_VERSION
        value: "20"
      - key: QUIZ_TITLE
        value: Ahnsen Quizabend
      - key: QUESTION_SECONDS
        value: "20"
      - key: EVENT_PASSWORD
        sync: false
      - key: ADMIN_PASSWORD
        sync: false
EOF

find . -maxdepth 1 -type f \
  \( -name 'quiz-v6*' -o -name 'quiz-v62x*' -o -name 'quiz-live-archive*' \) \
  -print0 | xargs -0 -r git rm -f --

git rm -f .github/workflows/materialize-quiz-app.yml
git rm -f .github/workflows/materialize-quiz-app-pr.yml
git rm -f scripts/materialize-quiz.sh
git rm -f scripts/catalog-quality.test.js

git config user.name 'github-actions[bot]'
git config user.email '41898282+github-actions[bot]@users.noreply.github.com'
git add -A quiz-app render.yaml
git commit -m 'Stelle Quiz auf normale Projektdateien um und prüfe Fragenkatalog'
git push origin HEAD:quiz-build-cleanup
