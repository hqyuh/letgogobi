FROM quay.io/debezium/connect:3.6.0.Final

ARG GROOVY_VERSION=4.0.21

# Groovy JSR-223 engine (required by io.debezium.transforms.Filter)
RUN curl -fsSL -o /kafka/external_libs/debezium-scripting/groovy-${GROOVY_VERSION}.jar \
      "https://repo1.maven.org/maven2/org/apache/groovy/groovy/${GROOVY_VERSION}/groovy-${GROOVY_VERSION}.jar" && \
    curl -fsSL -o /kafka/external_libs/debezium-scripting/groovy-jsr223-${GROOVY_VERSION}.jar \
      "https://repo1.maven.org/maven2/org/apache/groovy/groovy-jsr223/${GROOVY_VERSION}/groovy-jsr223-${GROOVY_VERSION}.jar"
