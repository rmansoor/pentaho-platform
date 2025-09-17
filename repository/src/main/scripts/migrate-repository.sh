#!/bin/bash
#
# Pentaho Repository Migration Script
#
# This script provides a command-line interface for migrating repository data
# from existing Pentaho repository implementations (JCR, FileSystem) to the
# new Git-based repository.
#
# Usage: ./migrate-repository.sh [options]
#

# Script configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PENTAHO_HOME="${PENTAHO_HOME:-/opt/pentaho}"
JAVA_HOME="${JAVA_HOME:-/usr/lib/jvm/java-8-openjdk}"
MIGRATION_TOOL_CLASS="org.pentaho.platform.repository2.unified.git.migration.tools.MigrationTool"

# Default configuration
SOURCE_CONFIG=""
TARGET_GIT_DIR=""
SOURCE_PATH="/"
TARGET_BRANCH=""
BATCH_SIZE="100"
MIGRATE_ACLS="true"
MIGRATE_METADATA="true"
MIGRATE_VERSIONS="true"
CONTINUE_ON_ERROR="false"
VALIDATE_MIGRATION="true"
DRY_RUN="false"
VERBOSE="false"
QUIET="false"
SPRING_PROFILE="default"

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_color() {
    local color=$1
    local message=$2
    echo -e "${color}${message}${NC}"
}

# Function to print usage information
print_usage() {
    cat << EOF
Pentaho Repository Migration Script

Usage: $0 [options]

Options:
    --source-config <file>      Source repository Spring configuration file
    --target-git-dir <dir>      Target Git repository directory
    --source-path <path>        Path to migrate (default: /)
    --target-branch <branch>    Target Git branch (default: current)
    --batch-size <size>         Batch commit size (default: 100)
    --no-acls                   Skip ACL migration
    --no-metadata               Skip metadata migration
    --no-versions               Skip version history migration
    --continue-on-error         Continue migration on individual item errors
    --validate                  Validate migration after completion
    --dry-run                   Show what would be migrated without doing it
    --verbose                   Show detailed progress information
    --quiet                     Suppress progress output
    --profile <profile>         Spring profile to use (default, jcr-migration, filesystem-migration)
    --help, -h                  Show this help message

Examples:
    # Interactive migration
    $0

    # JCR to Git migration
    $0 --source-config repository-jcr.spring.xml \\
       --target-git-dir /opt/pentaho/git-repo \\
       --profile jcr-migration \\
       --validate

    # FileSystem to Git migration
    $0 --source-config repository-filesystem.spring.xml \\
       --target-git-dir /opt/pentaho/git-repo \\
       --profile filesystem-migration \\
       --no-acls --no-versions

    # Migrate specific folder
    $0 --source-config repository.spring.xml \\
       --target-git-dir /opt/pentaho/git-repo \\
       --source-path /public \\
       --continue-on-error

Environment Variables:
    PENTAHO_HOME               Pentaho installation directory (default: /opt/pentaho)
    JAVA_HOME                  Java installation directory
    MIGRATION_HEAP_SIZE        JVM heap size (default: 2g)
    MIGRATION_LOG_LEVEL        Log level (default: INFO)

EOF
}

# Function to validate prerequisites
validate_prerequisites() {
    print_color $BLUE "Validating prerequisites..."

    # Check Java
    if [ ! -x "$JAVA_HOME/bin/java" ]; then
        print_color $RED "Error: Java not found at $JAVA_HOME/bin/java"
        print_color $YELLOW "Please set JAVA_HOME environment variable"
        exit 1
    fi

    # Check Pentaho installation
    if [ ! -d "$PENTAHO_HOME" ]; then
        print_color $RED "Error: Pentaho installation not found at $PENTAHO_HOME"
        print_color $YELLOW "Please set PENTAHO_HOME environment variable"
        exit 1
    fi

    # Check source configuration
    if [ -n "$SOURCE_CONFIG" ] && [ ! -f "$SOURCE_CONFIG" ]; then
        print_color $RED "Error: Source configuration file not found: $SOURCE_CONFIG"
        exit 1
    fi

    # Check target Git directory
    if [ -n "$TARGET_GIT_DIR" ]; then
        if [ ! -d "$TARGET_GIT_DIR" ]; then
            print_color $RED "Error: Target Git directory does not exist: $TARGET_GIT_DIR"
            exit 1
        fi

        if [ ! -d "$TARGET_GIT_DIR/.git" ]; then
            print_color $RED "Error: Target directory is not a Git repository: $TARGET_GIT_DIR"
            print_color $YELLOW "Please initialize the Git repository first:"
            print_color $YELLOW "  cd $TARGET_GIT_DIR && git init"
            exit 1
        fi
    fi

    print_color $GREEN "Prerequisites validated successfully"
}

# Function to setup classpath
setup_classpath() {
    local CLASSPATH="$PENTAHO_HOME/tomcat/webapps/pentaho/WEB-INF/classes"
    CLASSPATH="$CLASSPATH:$PENTAHO_HOME/tomcat/webapps/pentaho/WEB-INF/lib/*"
    CLASSPATH="$CLASSPATH:$PENTAHO_HOME/pentaho-solutions/system/kettle/lib/*"
    
    # Add migration-specific libraries if they exist
    if [ -d "$PENTAHO_HOME/migration/lib" ]; then
        CLASSPATH="$CLASSPATH:$PENTAHO_HOME/migration/lib/*"
    fi
    
    echo "$CLASSPATH"
}

# Function to build Java command arguments
build_java_args() {
    local args=()
    
    # JVM settings
    args+=("-Xmx${MIGRATION_HEAP_SIZE:-2g}")
    args+=("-Dfile.encoding=UTF-8")
    args+=("-Dlog4j.configuration=file:$PENTAHO_HOME/tomcat/webapps/pentaho/WEB-INF/classes/log4j.properties")
    
    # Spring profile
    if [ -n "$SPRING_PROFILE" ]; then
        args+=("-Dspring.profiles.active=$SPRING_PROFILE")
    fi
    
    # Migration tool arguments
    if [ -n "$SOURCE_CONFIG" ]; then
        args+=("--source-config" "$SOURCE_CONFIG")
    fi
    
    if [ -n "$TARGET_GIT_DIR" ]; then
        args+=("--target-git-dir" "$TARGET_GIT_DIR")
    fi
    
    if [ "$SOURCE_PATH" != "/" ]; then
        args+=("--source-path" "$SOURCE_PATH")
    fi
    
    if [ -n "$TARGET_BRANCH" ]; then
        args+=("--target-branch" "$TARGET_BRANCH")
    fi
    
    if [ "$BATCH_SIZE" != "100" ]; then
        args+=("--batch-size" "$BATCH_SIZE")
    fi
    
    if [ "$MIGRATE_ACLS" = "false" ]; then
        args+=("--no-acls")
    fi
    
    if [ "$MIGRATE_METADATA" = "false" ]; then
        args+=("--no-metadata")
    fi
    
    if [ "$MIGRATE_VERSIONS" = "false" ]; then
        args+=("--no-versions")
    fi
    
    if [ "$CONTINUE_ON_ERROR" = "true" ]; then
        args+=("--continue-on-error")
    fi
    
    if [ "$VALIDATE_MIGRATION" = "true" ]; then
        args+=("--validate")
    fi
    
    if [ "$DRY_RUN" = "true" ]; then
        args+=("--dry-run")
    fi
    
    if [ "$VERBOSE" = "true" ]; then
        args+=("--verbose")
    fi
    
    if [ "$QUIET" = "true" ]; then
        args+=("--quiet")
    fi
    
    echo "${args[@]}"
}

# Function to run the migration
run_migration() {
    print_color $BLUE "Starting repository migration..."
    
    local CLASSPATH=$(setup_classpath)
    local JAVA_ARGS=($(build_java_args))
    
    # Create log directory if it doesn't exist
    mkdir -p "$(dirname "${MIGRATION_LOG_FILE:-/tmp/migration.log}")"
    
    # Run the migration tool
    "$JAVA_HOME/bin/java" \
        -cp "$CLASSPATH" \
        "${JAVA_ARGS[@]}" \
        "$MIGRATION_TOOL_CLASS" \
        2>&1 | tee "${MIGRATION_LOG_FILE:-/tmp/migration.log}"
    
    local exit_code=${PIPESTATUS[0]}
    
    if [ $exit_code -eq 0 ]; then
        print_color $GREEN "Migration completed successfully!"
    else
        print_color $RED "Migration failed with exit code: $exit_code"
        print_color $YELLOW "Check the log file for details: ${MIGRATION_LOG_FILE:-/tmp/migration.log}"
    fi
    
    return $exit_code
}

# Function for interactive setup
interactive_setup() {
    print_color $BLUE "=== Interactive Migration Setup ==="
    echo
    
    # Source configuration
    if [ -z "$SOURCE_CONFIG" ]; then
        read -p "Source repository Spring config file: " SOURCE_CONFIG
    fi
    
    # Target Git directory
    if [ -z "$TARGET_GIT_DIR" ]; then
        read -p "Target Git repository directory: " TARGET_GIT_DIR
    fi
    
    # Migration scope
    read -p "Source path to migrate [/]: " input
    if [ -n "$input" ]; then
        SOURCE_PATH="$input"
    fi
    
    # Migration options
    read -p "Migrate ACLs? [Y/n]: " input
    if [ "$input" = "n" ] || [ "$input" = "N" ]; then
        MIGRATE_ACLS="false"
    fi
    
    read -p "Migrate metadata? [Y/n]: " input
    if [ "$input" = "n" ] || [ "$input" = "N" ]; then
        MIGRATE_METADATA="false"
    fi
    
    read -p "Migrate version history? [Y/n]: " input
    if [ "$input" = "n" ] || [ "$input" = "N" ]; then
        MIGRATE_VERSIONS="false"
    fi
    
    read -p "Continue on errors? [y/N]: " input
    if [ "$input" = "y" ] || [ "$input" = "Y" ]; then
        CONTINUE_ON_ERROR="true"
    fi
    
    read -p "Validate after migration? [Y/n]: " input
    if [ "$input" = "n" ] || [ "$input" = "N" ]; then
        VALIDATE_MIGRATION="false"
    fi
    
    read -p "Batch commit size [100]: " input
    if [ -n "$input" ]; then
        BATCH_SIZE="$input"
    fi
    
    echo
    print_color $GREEN "Configuration complete. Starting migration..."
    echo
}

# Main script logic
main() {
    # Parse command line arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --source-config)
                SOURCE_CONFIG="$2"
                shift 2
                ;;
            --target-git-dir)
                TARGET_GIT_DIR="$2"
                shift 2
                ;;
            --source-path)
                SOURCE_PATH="$2"
                shift 2
                ;;
            --target-branch)
                TARGET_BRANCH="$2"
                shift 2
                ;;
            --batch-size)
                BATCH_SIZE="$2"
                shift 2
                ;;
            --no-acls)
                MIGRATE_ACLS="false"
                shift
                ;;
            --no-metadata)
                MIGRATE_METADATA="false"
                shift
                ;;
            --no-versions)
                MIGRATE_VERSIONS="false"
                shift
                ;;
            --continue-on-error)
                CONTINUE_ON_ERROR="true"
                shift
                ;;
            --validate)
                VALIDATE_MIGRATION="true"
                shift
                ;;
            --dry-run)
                DRY_RUN="true"
                shift
                ;;
            --verbose)
                VERBOSE="true"
                shift
                ;;
            --quiet)
                QUIET="true"
                shift
                ;;
            --profile)
                SPRING_PROFILE="$2"
                shift 2
                ;;
            --help|-h)
                print_usage
                exit 0
                ;;
            *)
                print_color $RED "Unknown option: $1"
                print_usage
                exit 1
                ;;
        esac
    done
    
    # Show banner
    print_color $BLUE "=== Pentaho Repository Migration Tool ==="
    echo
    
    # Interactive mode if required parameters not provided
    if [ -z "$SOURCE_CONFIG" ] || [ -z "$TARGET_GIT_DIR" ]; then
        interactive_setup
    fi
    
    # Validate prerequisites
    validate_prerequisites
    
    # Run migration
    run_migration
}

# Execute main function
main "$@"
