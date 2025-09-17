package org.pentaho.platform.repository2.unified.git.migration.examples;

import org.pentaho.platform.api.repository2.unified.IUnifiedRepository;
import org.pentaho.platform.repository2.unified.DefaultUnifiedRepository;
import org.pentaho.platform.repository2.unified.git.GitUnifiedRepository;
import org.pentaho.platform.repository2.unified.git.migration.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.File;

/**
 * Example programs demonstrating how to use the repository migration framework.
 * 
 * These examples show:
 * - Basic migration from JCR to Git
 * - FileSystem to Git migration
 * - Custom migration configurations
 * - Progress monitoring
 * - Error handling and rollback
 * 
 * @author Migration Framework
 */
public class MigrationExamples {

  private static final Logger logger = LoggerFactory.getLogger(MigrationExamples.class);

  /**
   * Example 1: Basic JCR to Git migration
   */
  public static void jcrToGitMigrationExample() throws Exception {
    logger.info("=== JCR to Git Migration Example ===");

    // Setup source JCR repository (assuming it's already configured)
    IUnifiedRepository jcrRepository = getJcrRepository();
    
    // Setup target Git repository
    File gitDir = new File("/opt/pentaho/repositories/git-repo");
    GitUnifiedRepository gitRepository = new GitUnifiedRepository(gitDir);
    
    // Configure migration
    MigrationConfiguration config = new MigrationConfiguration();
    config.setMigrateAcls(true);
    config.setMigrateMetadata(true);
    config.setMigrateVersionHistory(true);
    config.setValidateAfterMigration(true);
    config.setTargetBranch("jcr-migration");
    config.setCommitMessage("JCR to Git repository migration");
    
    // Create migration service
    UnifiedRepositoryMigrationService migrationService = 
        new UnifiedRepositoryMigrationService(jcrRepository, gitRepository, config);
    
    // Add progress listener
    migrationService.addMigrationListener((event, data) -> {
      switch (event) {
        case MIGRATION_STARTED:
          logger.info("Migration started");
          break;
        case PROGRESS_UPDATE:
          MigrationStatistics stats = (MigrationStatistics) data;
          logger.info("Progress: {} items processed, {} errors", 
                     stats.getProcessedItems(), stats.getTotalErrors());
          break;
        case MIGRATION_COMPLETED:
          MigrationResult result = (MigrationResult) data;
          logger.info("Migration completed: {}", result.getStatistics());
          break;
        case MIGRATION_FAILED:
          MigrationResult failedResult = (MigrationResult) data;
          logger.error("Migration failed: {}", failedResult.getError().getMessage());
          break;
      }
    });
    
    // Perform migration
    try {
      MigrationResult result = migrationService.migrateRepository();
      
      if (result.isSuccessful()) {
        logger.info("JCR migration completed successfully!");
        logger.info("Statistics: {}", result.getStatistics());
      } else {
        logger.error("JCR migration failed: {}", result.getError().getMessage());
      }
      
    } catch (Exception e) {
      logger.error("Migration failed with exception", e);
    }
  }

  /**
   * Example 2: FileSystem to Git migration with custom configuration
   */
  public static void fileSystemToGitMigrationExample() throws Exception {
    logger.info("=== FileSystem to Git Migration Example ===");

    // Setup source FileSystem repository
    IUnifiedRepository fileSystemRepository = getFileSystemRepository();
    
    // Setup target Git repository
    File gitDir = new File("/opt/pentaho/repositories/git-repo");
    GitUnifiedRepository gitRepository = new GitUnifiedRepository(gitDir);
    
    // Configure migration for FileSystem (typically no ACLs or version history)
    MigrationConfiguration config = new MigrationConfiguration();
    config.setMigrateAcls(false); // FileSystem repos don't typically have ACLs
    config.setMigrateMetadata(true);
    config.setMigrateVersionHistory(false); // FileSystem repos don't have version history
    config.setContinueOnError(true); // Continue if individual files fail
    config.setValidateAfterMigration(true);
    config.setBatchCommitSize(150); // Larger batches for simpler data
    config.setTargetBranch("filesystem-migration");
    config.setCommitMessage("FileSystem to Git repository migration");
    
    // Create migration service
    UnifiedRepositoryMigrationService migrationService = 
        new UnifiedRepositoryMigrationService(fileSystemRepository, gitRepository, config);
    
    // Perform migration
    MigrationResult result = migrationService.migrateRepository();
    
    if (result.isSuccessful()) {
      logger.info("FileSystem migration completed successfully!");
      logger.info("Statistics: {}", result.getStatistics());
    } else {
      logger.error("FileSystem migration failed: {}", result.getError().getMessage());
    }
  }

  /**
   * Example 3: Selective migration of specific folders
   */
  public static void selectiveMigrationExample() throws Exception {
    logger.info("=== Selective Migration Example ===");

    IUnifiedRepository sourceRepository = getJcrRepository();
    File gitDir = new File("/opt/pentaho/repositories/git-repo");
    GitUnifiedRepository gitRepository = new GitUnifiedRepository(gitDir);
    
    // Configure for fast migration
    MigrationConfiguration config = new MigrationConfiguration();
    config.setMigrateAcls(true);
    config.setMigrateMetadata(true);
    config.setMigrateVersionHistory(false); // Skip version history for speed
    config.setContinueOnError(true);
    config.setValidateAfterMigration(false); // Skip validation for speed
    config.setTargetBranch("selective-migration");
    
    UnifiedRepositoryMigrationService migrationService = 
        new UnifiedRepositoryMigrationService(sourceRepository, gitRepository, config);
    
    // Migrate specific folders
    String[] foldersToMigrate = {"/public", "/home", "/etc"};
    
    for (String folder : foldersToMigrate) {
      logger.info("Migrating folder: {}", folder);
      
      try {
        MigrationResult result = migrationService.migrateFolder(folder);
        
        if (result.isSuccessful()) {
          logger.info("Successfully migrated {}: {}", folder, result.getStatistics());
        } else {
          logger.error("Failed to migrate {}: {}", folder, result.getError().getMessage());
        }
        
      } catch (Exception e) {
        logger.error("Error migrating folder: " + folder, e);
        // Continue with next folder
      }
    }
  }

  /**
   * Example 4: Production migration with full validation and rollback
   */
  public static void productionMigrationExample() throws Exception {
    logger.info("=== Production Migration Example ===");

    IUnifiedRepository sourceRepository = getJcrRepository();
    File gitDir = new File("/opt/pentaho/repositories/git-repo");
    GitUnifiedRepository gitRepository = new GitUnifiedRepository(gitDir);
    
    // Configure for production with full safety
    MigrationConfiguration config = new MigrationConfiguration();
    config.setMigrateAcls(true);
    config.setMigrateMetadata(true);
    config.setMigrateVersionHistory(true);
    config.setContinueOnError(false); // Stop on any error
    config.setValidateAfterMigration(true); // Full validation
    config.setRollbackOnFailure(true); // Rollback if migration fails
    config.setBatchCommitSize(50); // Smaller batches for safety
    config.setTargetBranch("production-migration-" + System.currentTimeMillis());
    config.setCommitMessage("Production repository migration");
    
    UnifiedRepositoryMigrationService migrationService = 
        new UnifiedRepositoryMigrationService(sourceRepository, gitRepository, config);
    
    // Add comprehensive monitoring
    migrationService.addMigrationListener(new ProductionMigrationListener());
    
    try {
      logger.info("Starting production migration with full safety checks...");
      MigrationResult result = migrationService.migrateRepository();
      
      if (result.isSuccessful()) {
        logger.info("Production migration completed successfully!");
        logger.info("Final statistics: {}", result.getStatistics());
        
        // Merge to main branch if successful
        gitRepository.switchBranch("main");
        gitRepository.mergeBranch(config.getTargetBranch());
        logger.info("Migration branch merged to main");
        
      } else {
        logger.error("Production migration failed!");
        logger.error("Error: {}", result.getError().getMessage());
        logger.info("Rollback should have been performed automatically");
      }
      
    } catch (Exception e) {
      logger.error("Production migration failed with exception", e);
      throw e; // Re-throw for proper error handling
    }
  }

  /**
   * Example 5: Migration with custom filtering
   */
  public static void filteredMigrationExample() throws Exception {
    logger.info("=== Filtered Migration Example ===");

    IUnifiedRepository sourceRepository = getJcrRepository();
    File gitDir = new File("/opt/pentaho/repositories/git-repo");
    GitUnifiedRepository gitRepository = new GitUnifiedRepository(gitDir);
    
    // Configure migration with filtering
    MigrationConfiguration config = new MigrationConfiguration();
    config.setIncludePathPattern("(/public/.*|/home/.*/reports/.*)"); // Only public and report folders
    config.setExcludePathPattern(".*\\.tmp$|.*\\.temp$"); // Exclude temporary files
    config.setMaxFileSize(100 * 1024 * 1024); // Max 100MB files
    config.setMigrateAcls(true);
    config.setMigrateMetadata(true);
    config.setMigrateVersionHistory(false);
    config.setTargetBranch("filtered-migration");
    
    UnifiedRepositoryMigrationService migrationService = 
        new UnifiedRepositoryMigrationService(sourceRepository, gitRepository, config);
    
    MigrationResult result = migrationService.migrateRepository();
    
    logger.info("Filtered migration completed. Statistics: {}", result.getStatistics());
  }

  // Helper methods to get repository instances (would be implemented based on actual setup)
  
  private static IUnifiedRepository getJcrRepository() {
    // In a real implementation, this would load the JCR repository
    // from Spring configuration or create it programmatically
    logger.info("Loading JCR repository...");
    // return new DefaultUnifiedRepository(...);
    throw new UnsupportedOperationException("JCR repository setup not implemented in example");
  }

  private static IUnifiedRepository getFileSystemRepository() {
    // In a real implementation, this would load the FileSystem repository
    logger.info("Loading FileSystem repository...");
    // return new FileSystemBackedUnifiedRepository(...);
    throw new UnsupportedOperationException("FileSystem repository setup not implemented in example");
  }

  // Custom migration listener for production monitoring
  private static class ProductionMigrationListener implements MigrationListener {
    private long lastProgressTime = 0;
    
    @Override
    public void onMigrationEvent(MigrationEvent event, Object data) {
      switch (event) {
        case MIGRATION_STARTED:
          logger.info("PRODUCTION MIGRATION STARTED - All safety checks enabled");
          break;
          
        case PROGRESS_UPDATE:
          long now = System.currentTimeMillis();
          if (now - lastProgressTime > 30000) { // Report every 30 seconds
            MigrationStatistics stats = (MigrationStatistics) data;
            logger.info("PRODUCTION PROGRESS: {} items processed, {} folders, {} files, {} errors, rate: {:.1f} items/sec",
                       stats.getProcessedItems(), stats.getFolders(), stats.getFiles(), 
                       stats.getTotalErrors(), stats.getItemsPerSecond());
            lastProgressTime = now;
          }
          break;
          
        case MIGRATION_COMPLETED:
          MigrationResult result = (MigrationResult) data;
          logger.info("PRODUCTION MIGRATION COMPLETED SUCCESSFULLY!");
          logger.info("FINAL STATISTICS: {}", result.getStatistics());
          logger.info("Data migrated: {}", result.getStatistics().getFormattedDataSize());
          logger.info("Total time: {}", result.getStatistics().getFormattedDuration());
          break;
          
        case MIGRATION_FAILED:
          MigrationResult failedResult = (MigrationResult) data;
          logger.error("PRODUCTION MIGRATION FAILED!");
          logger.error("Error: {}", failedResult.getError().getMessage());
          logger.info("Rollback procedures should be initiated");
          break;
          
        case ERROR_OCCURRED:
          logger.warn("PRODUCTION MIGRATION ERROR: {}", data);
          break;
      }
    }
  }

  // Main method to run examples
  public static void main(String[] args) {
    try {
      if (args.length == 0) {
        logger.info("Usage: java MigrationExamples <example-name>");
        logger.info("Available examples:");
        logger.info("  jcr-to-git          - Basic JCR to Git migration");
        logger.info("  filesystem-to-git   - FileSystem to Git migration");
        logger.info("  selective           - Selective folder migration");
        logger.info("  production          - Production migration with full safety");
        logger.info("  filtered            - Migration with custom filtering");
        return;
      }
      
      String example = args[0].toLowerCase();
      
      switch (example) {
        case "jcr-to-git":
          jcrToGitMigrationExample();
          break;
        case "filesystem-to-git":
          fileSystemToGitMigrationExample();
          break;
        case "selective":
          selectiveMigrationExample();
          break;
        case "production":
          productionMigrationExample();
          break;
        case "filtered":
          filteredMigrationExample();
          break;
        default:
          logger.error("Unknown example: {}", example);
          break;
      }
      
    } catch (Exception e) {
      logger.error("Example failed", e);
      System.exit(1);
    }
  }
}
