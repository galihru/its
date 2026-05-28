#!/usr/bin/env bash

controller_classpath() {
  local jar_file="$1"
  local cp="$jar_file"
  local candidate

  if [ -n "${ITS_CONTROLLER_CLASSPATH:-}" ]; then
    cp="$cp:${ITS_CONTROLLER_CLASSPATH}"
  fi

  for candidate in \
    /usr/share/java/opencv*.jar \
    /usr/local/share/java/opencv*.jar \
    "$HOME"/.local/share/java/opencv*.jar \
    /usr/share/java/scala-library*.jar \
    /usr/share/java/scala3-library*.jar; do
    if [ -f "$candidate" ]; then
      cp="$cp:$candidate"
    fi
  done

  if [ -n "${SCALA_HOME:-}" ]; then
    for candidate in "$SCALA_HOME"/lib/*.jar; do
      if [ -f "$candidate" ]; then
        cp="$cp:$candidate"
      fi
    done
  fi

  printf '%s' "$cp"
}

controller_java() {
  local jar_file="$1"
  shift
  java ${ITS_JAVA_OPTS:-} -cp "$(controller_classpath "$jar_file")" ItsController "$@"
}
