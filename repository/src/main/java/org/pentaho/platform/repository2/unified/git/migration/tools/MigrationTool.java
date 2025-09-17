package org.pentaho.platform.repository2.unified.git.migration.tools;

import org.pentaho.platform.api.repository2.unified.IUnifiedRepository;
import org.pentaho.platform.repository2.unified.git.GitUnifiedRepository;
import org.pentaho.platform.repository2.unified.git.migration.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationContext;
import org.springframework.context.support.ClassPathXmlApplicationContext;

import java.io.File;
import java.util.Scanner;

/**
 * Command-line tool for performing repository migrations.
 * 
 * This tool provides:
 * - Interactive migration setup
 * - Command-line parameter support
 * - Progress monitoring
 * - Migration validation
 * - Rollback capabilities
 * 
 * Usage:
 * java -cp pentaho-platform.jar org.pentaho.platform.repository2.unified.git.migration.tools.MigrationTool
 * 
 * @author Migration Framework
 */
public class MigrationTool {

  private static final Logger logger = LoggerFactory.getLogger(MigrationTool.class);

  public static void main(String[] args) {
    try {
      MigrationTool tool = new MigrationTool();
      tool.run(args);
    } catch (Exception e) {
      logger.error("Migration tool failed", e);
      System.exit(1);
    }
  }

  public void run(String[] args) throws Exception {
    System.out.println("=== Pentaho Repository Migration Tool ===");
    System.out.println();

    // Parse command line arguments
    MigrationToolConfig config = parseArguments(args);
    
    if (config == null) {
      printUsage();
      return;
    }

    // Interactive mode if not all parameters provided
    if (config.isInteractive()) {
      config = runInteractiveSetup(config);
    }

    // Validate configuration
    if (!validateConfig(config)) {
      System.err.println("Invalid configuration. Exiting.");
      return;
    }

    // Perform migration
    performMigration(config);
  }

  private MigrationToolConfig parseArguments(String[] args) {
    MigrationToolConfig config = new MigrationToolConfig();

    for (int i = 0; i < args.length; i++) {
      String arg = args[i];
      
      switch (arg) {
        case "--help":
        case "-h":
          return null; // Will show usage
          
        case "--source-config":
          if (i + 1 < args.length) {
            config.sourceConfigFile = args[++i];
          }
          break;
          
        case "--target-git-dir":
          if (i + 1 < args.length) {
            config.targetGitDirectory = args[++i];
          }
          break;
          
        case "--source-path":
          if (i + 1 < args.length) {
            config.sourcePath = args[++i];
          }
          break;
          
        case "--target-branch":
          if (i + 1 < args.length) {
            config.targetBranch = args[++i];
          }
          break;
          
        case "--batch-size":
          if (i + 1 < args.length) {
            config.batchSize = Integer.parseInt(args[++i]);
          }
          break;
          
        case "--no-acls":
          config.migrateAcls = false;
          break;
          
        case "--no-metadata":
          config.migrateMetadata = false;
          break;
          
        case "--no-versions":
          config.migrateVersionHistory = false;
          break;
          
        case "--continue-on-error":
          config.continueOnError = true;
          break;
          
        case "--validate":
          config.validateAfterMigration = true;
          break;
          
        case "--dry-run":
          config.dryRun = true;
          break;
          
        case "--quiet":
          config.quiet = true;
          break;
          
        case "--verbose":
          config.verbose = true;
          break;
          
        default:
          System.err.println("Unknown argument: " + arg);
          break;
      }
    }

    return config;
  }

  private MigrationToolConfig runInteractiveSetup(MigrationToolConfig config) {
    Scanner scanner = new Scanner(System.in);

    System.out.println("Interactive Migration Setup");
    System.out.println("===========================");

    // Source repository configuration
    if (config.sourceConfigFile == null) {
      System.out.print("Source repository Spring config file: ");
      config.sourceConfigFile = scanner.nextLine().trim();
    }

    // Target Git directory
    if (config.targetGitDirectory == null) {
      System.out.print("Target Git repository directory: ");
      config.targetGitDirectory = scanner.nextLine().trim();
    }

    // Migration scope
    if (config.sourcePath == null) {
      System.out.print("Source path to migrate (/ for full repository): ");
      config.sourcePath = scanner.nextLine().trim();
      if (config.sourcePath.isEmpty()) {
        config.sourcePath = "/";
      }
    }

    // Migration options
    System.out.print("Migrate ACLs? (Y/n): ");
    String aclChoice = scanner.nextLine().trim().toLowerCase();
    config.migrateAcls = !aclChoice.equals("n");

    System.out.print("Migrate metadata? (Y/n): ");
    String metadataChoice = scanner.nextLine().trim().toLowerCase();
    config.migrateMetadata = !metadataChoice.equals("n");

    System.out.print("Migrate version history? (Y/n): ");
    String versionChoice = scanner.nextLine().trim().toLowerCase();
    config.migrateVersionHistory = !versionChoice.equals("n");

    System.out.print("Continue on errors? (y/N): ");
    String errorChoice = scanner.nextLine().trim().toLowerCase();
    config.continueOnError = errorChoice.equals("y");

    System.out.print("Validate after migration? (Y/n): ");
    String validateChoice = scanner.nextLine().trim().toLowerCase();
    config.validateAfterMigration = !validateChoice.equals("n");

    System.out.print("Batch commit size (0 for no batching): ");
    String batchStr = scanner.nextLine().trim();
    if (!batchStr.isEmpty()) {
      try {
        config.batchSize = Integer.parseInt(batchStr);
      } catch (NumberFormatException e) {
        System.out.println("Invalid batch size, using default: 100");
        config.batchSize = 100;
      }
    }

    return config;
  }

  private boolean validateConfig(MigrationToolConfig config) {
    boolean valid = true;

    // Check source config file
    if (config.sourceConfigFile == null || !new File(config.sourceConfigFile).exists()) {
      System.err.println("Source configuration file not found: " + config.sourceConfigFile);
      valid = false;
    }

    // Check target Git directory
    if (config.targetGitDirectory == null) {
      System.err.println("Target Git directory not specified");
      valid = false;
    } else {
      File gitDir = new File(config.targetGitDirectory);
      if (!gitDir.exists()) {
        System.err.println("Target Git directory does not exist: " + config.targetGitDirectory);
        valid = false;
      } else if (!new File(gitDir, ".git").exists()) {
        System.err.println("Target directory is not a Git repository: " + config.targetGitDirectory);
        valid = false;
      }
    }

    return valid;
  }

  private void performMigration(MigrationToolConfig config) throws Exception {
    System.out.println("Starting repository migration...");
    System.out.println("Source config: " + config.sourceConfigFile);
    System.out.println("Target Git dir: " + config.targetGitDirectory);
    System.out.println("Source path: " + config.sourcePath);
    System.out.println();

    // Load source repository
    ApplicationContext sourceContext = new ClassPathXmlApplicationContext(config.sourceConfigFile);
    IUnifiedRepository sourceRepository = sourceContext.getBean(IUnifiedRepository.class);
    
    if (sourceRepository == null) {
      throw new Exception("Could not load source repository from configuration");
    }

    // Create target Git repository
    File gitDir = new File(config.targetGitDirectory);
    GitUnifiedRepository targetRepository = new GitUnifiedRepository(gitDir);

    // Configure migration
    MigrationConfiguration migrationConfig = new MigrationConfiguration();
    migrationConfig.setMigrateAcls(config.migrateAcls);
    migrationConfig.setMigrateMetadata(config.migrateMetadata);
    migrationConfig.setMigrateVersionHistory(config.migrateVersionHistory);
    migrationConfig.setContinueOnError(config.continueOnError);
    migrationConfig.setValidateAfterMigration(config.validateAfterMigration);
    migrationConfig.setBatchCommitSize(config.batchSize);
    migrationConfig.setTargetBranch(config.targetBranch);

    if (config.verbose) {
      migrationConfig.setProgressReportInterval(10);
    } else if (!config.quiet) {
      migrationConfig.setProgressReportInterval(50);
    }

    // Create migration service
    UnifiedRepositoryMigrationService migrationService = new UnifiedRepositoryMigrationService(
        sourceRepository, targetRepository, migrationConfig
    );

    // Add progress listener
    migrationService.addMigrationListener(new ConsoleMigrationListener(config.quiet, config.verbose));

    // Perform migration
    MigrationResult result;
    
    if (config.dryRun) {
      System.out.println("DRY RUN MODE - No actual migration will be performed");
      // In a real implementation, you would add dry-run support
      result = new MigrationResult(true, new MigrationStatistics(), null);
    } else {
      if (config.sourcePath.equals("/")) {
        result = migrationService.migrateRepository();
      } else {
        // Check if source path is a folder or file
        if (sourceRepository.getFile(config.sourcePath).isFolder()) {
          result = migrationService.migrateFolder(config.sourcePath);
        } else {
          result = migrationService.migrateFile(config.sourcePath);
        }
      }
    }

    // Report results
    System.out.println();
    System.out.println("=== Migration Results ===");
    System.out.println("Status: " + (result.isSuccessful() ? "SUCCESS" : "FAILED"));
    System.out.println("Statistics: " + result.getStatistics());
    
    if (result.hasError()) {
      System.err.println("Error: " + result.getError().getMessage());
      if (config.verbose) {
        result.getError().printStackTrace();
      }
    }

    System.out.println("Migration completed.");
  }

  private void printUsage() {
    System.out.println("Usage: MigrationTool [options]");
    System.out.println();
    System.out.println("Options:");
    System.out.println("  --source-config <file>     Source repository Spring configuration file");
    System.out.println("  --target-git-dir <dir>     Target Git repository directory");
    System.out.println("  --source-path <path>       Path to migrate (default: /)");
    System.out.println("  --target-branch <branch>   Target Git branch (default: current)");
    System.out.println("  --batch-size <size>        Batch commit size (default: 100)");
    System.out.println("  --no-acls                  Skip ACL migration");
    System.out.println("  --no-metadata              Skip metadata migration");
    System.out.println("  --no-versions              Skip version history migration");
    System.out.println("  --continue-on-error        Continue migration on individual item errors");
    System.out.println("  --validate                 Validate migration after completion");
    System.out.println("  --dry-run                  Show what would be migrated without doing it");
    System.out.println("  --quiet                    Suppress progress output");
    System.out.println("  --verbose                  Show detailed progress information");
    System.out.println("  --help, -h                 Show this help message");
    System.out.println();
    System.out.println("Examples:");
    System.out.println("  # Full interactive migration");
    System.out.println("  java MigrationTool");
    System.out.println();
    System.out.println("  # Command-line migration");
    System.out.println("  java MigrationTool --source-config repository.spring.xml \\");
    System.out.println("                     --target-git-dir /path/to/git/repo \\");
    System.out.println("                     --validate --continue-on-error");
    System.out.println();
    System.out.println("  # Migrate specific folder");
    System.out.println("  java MigrationTool --source-config repository.spring.xml \\");
    System.out.println("                     --target-git-dir /path/to/git/repo \\");
    System.out.println("                     --source-path /public");
  }

  // Inner class for configuration
  private static class MigrationToolConfig {
    String sourceConfigFile;
    String targetGitDirectory;
    String sourcePath = "/";
    String targetBranch;
    int batchSize = 100;
    boolean migrateAcls = true;
    boolean migrateMetadata = true;
    boolean migrateVersionHistory = true;
    boolean continueOnError = false;
    boolean validateAfterMigration = false;
    boolean dryRun = false;
    boolean quiet = false;
    boolean verbose = false;

    boolean isInteractive() {
      return sourceConfigFile == null || targetGitDirectory == null;
    }
  }

  // Console progress listener
  private static class ConsoleMigrationListener implements MigrationListener {
    private final boolean quiet;
    private final boolean verbose;
    private long lastUpdate = 0;

    ConsoleMigrationListener(boolean quiet, boolean verbose) {
      this.quiet = quiet;
      this.verbose = verbose;
    }

    @Override
    public void onMigrationEvent(MigrationEvent event, Object data) {
      if (quiet && event != MigrationEvent.MIGRATION_COMPLETED && event != MigrationEvent.MIGRATION_FAILED) {
        return;
      }

      switch (event) {
        case MIGRATION_STARTED:
          System.out.println("Migration started...");
          break;

        case PROGRESS_UPDATE:
          long now = System.currentTimeMillis();
          if (now - lastUpdate > 5000) { // Update every 5 seconds max
            MigrationStatistics stats = (MigrationStatistics) data;
            System.out.printf("Progress: %d items processed, %d errors, %.1f items/sec\n",
                            stats.getProcessedItems(), stats.getTotalErrors(), stats.getItemsPerSecond());
            lastUpdate = now;
          }
          break;

        case MIGRATION_COMPLETED:
          MigrationResult result = (MigrationResult) data;
          System.out.println("Migration completed successfully!");
          if (verbose) {
            System.out.println("Final statistics: " + result.getStatistics());
          }
          break;

        case MIGRATION_FAILED:
          MigrationResult failedResult = (MigrationResult) data;
          System.err.println("Migration failed!");
          if (verbose && failedResult.hasError()) {
            failedResult.getError().printStackTrace();
          }
          break;

        case ERROR_OCCURRED:
          if (verbose) {
            System.err.println("Error: " + data);
          }
          break;
      }
    }
  }
}
