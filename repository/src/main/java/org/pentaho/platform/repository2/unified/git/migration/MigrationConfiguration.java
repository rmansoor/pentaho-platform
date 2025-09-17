package org.pentaho.platform.repository2.unified.git.migration;

/**
 * Configuration options for repository migration.
 * 
 * @author Migration Framework
 */
public class MigrationConfiguration {

  // Migration behavior settings
  private boolean migrateAcls = true;
  private boolean migrateMetadata = true;
  private boolean migrateVersionHistory = true;
  private boolean continueOnError = true;
  private boolean validateAfterMigration = true;
  private boolean rollbackOnFailure = false;

  // Performance settings
  private int batchCommitSize = 100; // 0 = no batching
  private int progressReportInterval = 50;
  private int maxConcurrentOperations = 1; // For future parallel processing

  // Target settings
  private String targetBranch = null; // null = use current branch
  private String commitMessage = "Repository migration";
  private String commitAuthor = "Migration Service";
  private String commitEmail = "migration@pentaho.com";

  // Filter settings
  private String includePathPattern = null; // null = include all
  private String excludePathPattern = null; // null = exclude none
  private long maxFileSize = -1; // -1 = no limit

  // Default constructor with sensible defaults
  public MigrationConfiguration() {
    // Default values set above
  }

  // Getters and setters

  public boolean isMigrateAcls() {
    return migrateAcls;
  }

  public void setMigrateAcls(boolean migrateAcls) {
    this.migrateAcls = migrateAcls;
  }

  public boolean isMigrateMetadata() {
    return migrateMetadata;
  }

  public void setMigrateMetadata(boolean migrateMetadata) {
    this.migrateMetadata = migrateMetadata;
  }

  public boolean isMigrateVersionHistory() {
    return migrateVersionHistory;
  }

  public void setMigrateVersionHistory(boolean migrateVersionHistory) {
    this.migrateVersionHistory = migrateVersionHistory;
  }

  public boolean isContinueOnError() {
    return continueOnError;
  }

  public void setContinueOnError(boolean continueOnError) {
    this.continueOnError = continueOnError;
  }

  public boolean isValidateAfterMigration() {
    return validateAfterMigration;
  }

  public void setValidateAfterMigration(boolean validateAfterMigration) {
    this.validateAfterMigration = validateAfterMigration;
  }

  public boolean isRollbackOnFailure() {
    return rollbackOnFailure;
  }

  public void setRollbackOnFailure(boolean rollbackOnFailure) {
    this.rollbackOnFailure = rollbackOnFailure;
  }

  public int getBatchCommitSize() {
    return batchCommitSize;
  }

  public void setBatchCommitSize(int batchCommitSize) {
    this.batchCommitSize = batchCommitSize;
  }

  public int getProgressReportInterval() {
    return progressReportInterval;
  }

  public void setProgressReportInterval(int progressReportInterval) {
    this.progressReportInterval = progressReportInterval;
  }

  public int getMaxConcurrentOperations() {
    return maxConcurrentOperations;
  }

  public void setMaxConcurrentOperations(int maxConcurrentOperations) {
    this.maxConcurrentOperations = maxConcurrentOperations;
  }

  public String getTargetBranch() {
    return targetBranch;
  }

  public void setTargetBranch(String targetBranch) {
    this.targetBranch = targetBranch;
  }

  public String getCommitMessage() {
    return commitMessage;
  }

  public void setCommitMessage(String commitMessage) {
    this.commitMessage = commitMessage;
  }

  public String getCommitAuthor() {
    return commitAuthor;
  }

  public void setCommitAuthor(String commitAuthor) {
    this.commitAuthor = commitAuthor;
  }

  public String getCommitEmail() {
    return commitEmail;
  }

  public void setCommitEmail(String commitEmail) {
    this.commitEmail = commitEmail;
  }

  public String getIncludePathPattern() {
    return includePathPattern;
  }

  public void setIncludePathPattern(String includePathPattern) {
    this.includePathPattern = includePathPattern;
  }

  public String getExcludePathPattern() {
    return excludePathPattern;
  }

  public void setExcludePathPattern(String excludePathPattern) {
    this.excludePathPattern = excludePathPattern;
  }

  public long getMaxFileSize() {
    return maxFileSize;
  }

  public void setMaxFileSize(long maxFileSize) {
    this.maxFileSize = maxFileSize;
  }

  @Override
  public String toString() {
    return "MigrationConfiguration{" +
           "migrateAcls=" + migrateAcls +
           ", migrateMetadata=" + migrateMetadata +
           ", migrateVersionHistory=" + migrateVersionHistory +
           ", continueOnError=" + continueOnError +
           ", validateAfterMigration=" + validateAfterMigration +
           ", rollbackOnFailure=" + rollbackOnFailure +
           ", batchCommitSize=" + batchCommitSize +
           ", progressReportInterval=" + progressReportInterval +
           ", maxConcurrentOperations=" + maxConcurrentOperations +
           ", targetBranch='" + targetBranch + '\'' +
           ", commitMessage='" + commitMessage + '\'' +
           ", commitAuthor='" + commitAuthor + '\'' +
           ", commitEmail='" + commitEmail + '\'' +
           ", includePathPattern='" + includePathPattern + '\'' +
           ", excludePathPattern='" + excludePathPattern + '\'' +
           ", maxFileSize=" + maxFileSize +
           '}';
  }
}
