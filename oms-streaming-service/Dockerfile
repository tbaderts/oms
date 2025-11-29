FROM eclipse-temurin:21-jre-alpine

WORKDIR /app

COPY build/libs/*.jar app.jar

EXPOSE 8092 7000

ENTRYPOINT ["java", "-jar", "app.jar"]
