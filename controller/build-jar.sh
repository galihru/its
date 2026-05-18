#!/bin/bash
# Build JAR for ItsController with sysfs GPIO support

# Compile Scala code
scalac Main.scala -d .

# Create JAR with manifest
echo "Main-Class: ItsController" > manifest.txt
jar cfm ItsController.jar manifest.txt ItsController*.class

echo "JAR built: ItsController.jar"