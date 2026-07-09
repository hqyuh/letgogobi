# Node response is 200 = leader

curl -s -o /dev/null -w "pg1: %{http_code}\n" http://localhost:8001/primary
curl -s -o /dev/null -w "pg2: %{http_code}\n" http://localhost:8002/primary
curl -s -o /dev/null -w "pg3: %{http_code}\n" http://localhost:8003/primary
curl -s -o /dev/null -w "pg4: %{http_code}\n" http://localhost:8004/primary

# Node response is 200 = replica

curl -s -o /dev/null -w "pg1: %{http_code}\n" http://localhost:8001/replica
curl -s -o /dev/null -w "pg2: %{http_code}\n" http://localhost:8002/replica
curl -s -o /dev/null -w "pg3: %{http_code}\n" http://localhost:8003/replica
curl -s -o /dev/null -w "pg4: %{http_code}\n" http://localhost:8004/replica
