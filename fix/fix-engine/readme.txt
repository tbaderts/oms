PATH=/c/apps/apache-maven-3.6.3/bin:$PATH
mvn spring-boot:run

kafka:
set ZOOKEEPER_HOME=C:\apps\zookeeper-3.4.12
set PATH=%PATH%;%ZOOKEEPER_HOME%\bin
zkserver
cd C:\apps\kafka_2.12-2.4.0
.\bin\windows\kafka-server-start.bat .\config\server.properties

test message:
{"id":1,"side":"BUY","orderType":"MARKET","tif":"DAY","quantity":100,"state":"LIVE","symbol":"TXN","transactionTimestamp":"2020-01-03T07:36:45.755Z","destinationUser":"out_fix_sim"}

admin:
http://localhost:8080/admin/sessionstatus
http://localhost:8080/admin/FIX.4.4:DEMO->TEST/reset
http://localhost:8080/admin/FIX.4.4:TEST->DEMO/reset
http://localhost:8080/admin/FIX.4.4:DEMO->TEST/logout
http://localhost:8080/admin/FIX.4.4:DEMO->TEST/logon
http://localhost:8080/admin/FIX.4.4:DEMO->TEST/setsenderseqnum/21
http://localhost:8080/admin/FIX.4.4:DEMO->TEST/settargetseqnum/19