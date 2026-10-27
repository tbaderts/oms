FROM eclipse-temurin:25-jre-alpine AS build
ARG JAR_FILE=build/libs/*-SNAPSHOT.jar
COPY ${JAR_FILE} application.jar

FROM eclipse-temurin:25-jre-alpine
WORKDIR /app
COPY --from=build application.jar app.jar
EXPOSE 8094
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:8094/actuator/health || exit 1
ENTRYPOINT ["java", "-jar", "app.jar"]
