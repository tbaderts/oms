FROM eclipse-temurin:25-jdk AS build
WORKDIR /workspace
COPY . .
# gradlew may be checked out with CRLF on Windows; Linux sh needs LF
RUN sed -i 's/\r$//' gradlew && chmod +x gradlew \
    && ./gradlew bootJar --no-daemon \
    && cp build/libs/*-SNAPSHOT.jar /application.jar

FROM eclipse-temurin:25-jre
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*
COPY --from=build /application.jar application.jar
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD curl -f http://localhost:8080/actuator/health || exit 1
ENTRYPOINT ["java", "-Xmx512M", "-jar", "/application.jar"]
