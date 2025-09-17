package org.pentaho.platform.repository2.unified.git.migration;

/**
 * Result of a migration operation.
 * 
 * @author Migration Framework
 */
public class MigrationResult {

  private final boolean successful;
  private final MigrationStatistics statistics;
  private final Exception error;

  public MigrationResult(boolean successful, MigrationStatistics statistics, Exception error) {
    this.successful = successful;
    this.statistics = statistics;
    this.error = error;
  }

  public boolean isSuccessful() {
    return successful;
  }

  public MigrationStatistics getStatistics() {
    return statistics;
  }

  public Exception getError() {
    return error;
  }

  public boolean hasError() {
    return error != null;
  }

  @Override
  public String toString() {
    return String.format("MigrationResult{successful=%s, statistics=%s, error=%s}",
                        successful, statistics, error != null ? error.getMessage() : "none");
  }
}

/**
 * Exception thrown during migration operations.
 */
class MigrationException extends Exception {
  
  public MigrationException(String message) {
    super(message);
  }

  public MigrationException(String message, Throwable cause) {
    super(message, cause);
  }
}

/**
 * Migration events for listener notification.
 */
enum MigrationEvent {
  MIGRATION_STARTED,
  MIGRATION_COMPLETED,
  MIGRATION_FAILED,
  PROGRESS_UPDATE,
  ITEM_MIGRATED,
  ERROR_OCCURRED
}

/**
 * Interface for migration event listeners.
 */
interface MigrationListener {
  void onMigrationEvent(MigrationEvent event, Object data);
}
