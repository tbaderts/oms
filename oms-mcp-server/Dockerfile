FROM eclipse-temurin:25-jre AS build
ARG JAR_FILE=build/libs/*-SNAPSHOT.jar
COPY ${JAR_FILE} application.jar

FROM eclipse-temurin:25-jre
WORKDIR /app
COPY --from=build /application.jar application.jar
ENTRYPOINT ["java", "-jar", "/app/application.jar"]
