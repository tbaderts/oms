mvn spring-boot:run

test message:
{
  "id": 1,
  "side": "BUY",
  "orderType": "MARKET",
  "tif": "DAY",
  "quantity": 100,
  "state": "UNACK",
  "symbol": "INTC",
  "currency": "USD",
  "transactionTimestamp": "2020-01-03T07:36:45.755Z",
  "destinationUser": "out_fix_sim"
}

admin:
http://localhost:8080/admin/sessionstatus
http://localhost:8080/admin/FIX.4.4:DEMO->TEST/reset
http://localhost:8080/admin/FIX.4.4:TEST->DEMO/reset
http://localhost:8080/admin/FIX.4.4:DEMO->TEST/logout
http://localhost:8080/admin/FIX.4.4:DEMO->TEST/logon
http://localhost:8080/admin/FIX.4.4:DEMO->TEST/setsenderseqnum/21
http://localhost:8080/admin/FIX.4.4:DEMO->TEST/settargetseqnum/19