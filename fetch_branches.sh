#!/bin/bash

# howto
# Add agency credentials to docker-compose-dev.yml
# Add token in this file
# run './fetch_branches.sh' from this folder root

# Liste af agencyIds
agencyIds=("732900" "737000" "911130" "721700" "726900" "790900" "749200" "757300" "714700" "757500" "716500" "911130" "784000" "726500" "700400" "722300" "770600" "756100" "775100" "735000" "733600" "724000" "781300" "725300" "773000" "718700" "775600" "761500" "732900" "716900" "715100" "710100" "911116" "717300" "830480" "715300" "765700" "737600" "743000" "727000" "754000" "772700" "779100" "747900" "741000" "732600" "737000" "736000" "782500" "730600" "774600" "777900" "718500" "733000" "734000" "771000" "753000" "740000" "744000" "776000" "739000" "748000" "748200" "767100" "782000" "720100" "721000" "751000" "719000" "716300" "717500" "770700" "715900" "745000" "718300" "766100" "716100" "725000" "760700" "778700" "721900" "762100" "742000" "725900" "774000" "716700" "785100" "763000" "766500" "731600" "784600" "746100" "774100" "758000" "732000" "715500" "723000" "726000" "776600" "786000" "715700" "781000" "777300" "784900" "755000")

# Token
token=""

# Fejllog-fil
error_log="error_log.txt"
> "$error_log" # rydder logfilen ved start

# Loop gennem alle agencyIds
for agencyId in "${agencyIds[@]}"
do
  echo "▶ Henter data for agencyId: $agencyId"

  # Lav curl request og fang HTTP status kode
  http_response=$(curl -s -o response.json -w "%{http_code}" -H "Authorization: Bearer $token" "http://localhost:3000/external/v1/$agencyId/branches")

  if [[ "$http_response" -ne 200 ]]; then
    echo "❌ FEJL for agencyId $agencyId – HTTP $http_response"
    echo "agencyId: $agencyId – HTTP status: $http_response" >> "$error_log"
  else
    echo "✅ OK for agencyId $agencyId"
    cat response.json
  fi

  echo "--- Vent 0.5 sekund før næste kald ---"
  sleep 0.5
done
