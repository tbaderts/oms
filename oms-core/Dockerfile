FROM eclipse-temurin:25

ARG JAR_FILE=build/libs/*-SNAPSHOT.jar
COPY ${JAR_FILE} application.jar
CMD apt-get update -y

ENTRYPOINT ["java", "-Xmx2048M", "-jar", "/application.jar"]