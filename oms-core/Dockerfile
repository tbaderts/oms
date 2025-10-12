FROM alpine/java:21-jre

RUN addgroup -S spring && adduser -S spring -G spring
USER spring:spring

ARG JAR_FILE=build/libs/*-SNAPSHOT.jar
COPY ${JAR_FILE} application.jar
CMD apt-get update -y

ENTRYPOINT ["java", "-Xmx2048M", "-jar", "/application.jar"]