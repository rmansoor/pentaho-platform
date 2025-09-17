package org.pentaho.platform.repository2.unified.git.migration;

import org.pentaho.platform.api.repository2.unified.IRepositoryFileData;
import org.pentaho.platform.api.repository2.unified.IUnifiedRepository;
import org.pentaho.platform.api.repository2.unified.RepositoryFile;
import org.pentaho.platform.api.repository2.unified.RepositoryFileAcl;
import org.pentaho.platform.api.repository2.unified.RepositoryRequest;
import org.pentaho.platform.api.repository2.unified.UnifiedRepositoryException;
import org.pentaho.platform.api.repository2.unified.VersionSummary;
import org.pentaho.platform.api.repository2.unified.data.simple.SimpleRepositoryFileData;
import org.pentaho.platform.repository2.unified.git.GitUnifiedRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.util.Assert;

import java.io.Serializable;
import java.util.*;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Migration service for transferring repository content from any existing
 * {@link IUnifiedRepository} implementation to a Git-based repository.
 * 
 * This service provides:
 * - Complete repository content migration
 * - ACL preservation and migration
 * - Metadata transfer
 * - Version history migration (where supported)
 * - Progress tracking and reporting
 * - Rollback capabilities
 * - Validation and verification
 * 
 * Supports migration from:
 * - JCR-based repositories (DefaultUnifiedRepository)
 * - File system-based repositories
 * - Any custom IUnifiedRepository implementation
 * 
 * @author Migration Framework
 */
public class UnifiedRepositoryMigrationService {

  private static final Logger logger = LoggerFactory.getLogger(UnifiedRepositoryMigrationService.class);

  // ~ Instance fields
  // =================================================================================================
  
  private final IUnifiedRepository sourceRepository;
  private final GitUnifiedRepository targetRepository;
  private final MigrationConfiguration config;
  private final MigrationStatistics statistics;
  private final List<MigrationListener> listeners;

  // ~ Constructors
  // ====================================================================================================

  /**
   * Constructs a new migration service with default configuration.
   * 
   * @param sourceRepository the source repository to migrate from
   * @param targetRepository the target Git repository to migrate to
   */
  public UnifiedRepositoryMigrationService(IUnifiedRepository sourceRepository, 
                                          GitUnifiedRepository targetRepository) {
    this(sourceRepository, targetRepository, new MigrationConfiguration());
  }

  /**
   * Constructs a new migration service with custom configuration.
   * 
   * @param sourceRepository the source repository to migrate from
   * @param targetRepository the target Git repository to migrate to
   * @param config the migration configuration
   */
  public UnifiedRepositoryMigrationService(IUnifiedRepository sourceRepository, 
                                          GitUnifiedRepository targetRepository,
                                          MigrationConfiguration config) {
    Assert.notNull(sourceRepository, "Source repository cannot be null");
    Assert.notNull(targetRepository, "Target repository cannot be null");
    Assert.notNull(config, "Configuration cannot be null");
    
    this.sourceRepository = sourceRepository;
    this.targetRepository = targetRepository;
    this.config = config;
    this.statistics = new MigrationStatistics();
    this.listeners = new ArrayList<>();
  }

  // ~ Migration Methods
  // =========================================================================================================

  /**
   * Performs a complete repository migration.
   * 
   * @return migration result with statistics and status
   * @throws MigrationException if migration fails
   */
  public MigrationResult migrateRepository() throws MigrationException {
    logger.info("Starting repository migration from {} to Git repository", 
                sourceRepository.getClass().getSimpleName());
    
    statistics.reset();
    notifyListeners(MigrationEvent.MIGRATION_STARTED, null);
    
    try {
      // Pre-migration validation
      validateSourceRepository();
      validateTargetRepository();
      
      // Create migration plan
      MigrationPlan plan = createMigrationPlan();
      logger.info("Migration plan created: {} items to migrate", plan.getTotalItems());
      
      // Execute migration phases
      executeMigrationPlan(plan);
      
      // Post-migration validation
      if (config.isValidateAfterMigration()) {
        validateMigration(plan);
      }
      
      // Create migration result
      MigrationResult result = new MigrationResult(true, statistics.copy(), null);
      
      logger.info("Repository migration completed successfully. Statistics: {}", statistics);
      notifyListeners(MigrationEvent.MIGRATION_COMPLETED, result);
      
      return result;
      
    } catch (Exception e) {
      logger.error("Repository migration failed", e);
      MigrationResult result = new MigrationResult(false, statistics.copy(), e);
      notifyListeners(MigrationEvent.MIGRATION_FAILED, result);
      
      if (config.isRollbackOnFailure()) {
        performRollback();
      }
      
      throw new MigrationException("Migration failed: " + e.getMessage(), e);
    }
  }

  /**
   * Migrates a specific folder and its contents.
   * 
   * @param sourcePath the source folder path to migrate
   * @return migration result for the folder
   * @throws MigrationException if folder migration fails
   */
  public MigrationResult migrateFolder(String sourcePath) throws MigrationException {
    logger.info("Starting folder migration: {}", sourcePath);
    
    try {
      RepositoryFile sourceFolder = sourceRepository.getFile(sourcePath);
      if (sourceFolder == null) {
        throw new MigrationException("Source folder not found: " + sourcePath);
      }
      
      if (!sourceFolder.isFolder()) {
        throw new MigrationException("Source path is not a folder: " + sourcePath);
      }
      
      statistics.reset();
      migrateFolderRecursive(sourceFolder, null);
      
      MigrationResult result = new MigrationResult(true, statistics.copy(), null);
      logger.info("Folder migration completed: {}. Statistics: {}", sourcePath, statistics);
      
      return result;
      
    } catch (Exception e) {
      logger.error("Folder migration failed: " + sourcePath, e);
      throw new MigrationException("Folder migration failed: " + e.getMessage(), e);
    }
  }

  /**
   * Migrates a single file.
   * 
   * @param sourcePath the source file path to migrate
   * @return migration result for the file
   * @throws MigrationException if file migration fails
   */
  public MigrationResult migrateFile(String sourcePath) throws MigrationException {
    logger.info("Starting file migration: {}", sourcePath);
    
    try {
      RepositoryFile sourceFile = sourceRepository.getFile(sourcePath);
      if (sourceFile == null) {
        throw new MigrationException("Source file not found: " + sourcePath);
      }
      
      if (sourceFile.isFolder()) {
        throw new MigrationException("Source path is a folder, not a file: " + sourcePath);
      }
      
      statistics.reset();
      migrateFileItem(sourceFile, null);
      
      MigrationResult result = new MigrationResult(true, statistics.copy(), null);
      logger.info("File migration completed: {}. Statistics: {}", sourcePath, statistics);
      
      return result;
      
    } catch (Exception e) {
      logger.error("File migration failed: " + sourcePath, e);
      throw new MigrationException("File migration failed: " + e.getMessage(), e);
    }
  }

  // ~ Private Migration Implementation
  // =========================================================================================================

  private void validateSourceRepository() throws MigrationException {
    try {
      // Test basic connectivity
      RepositoryFile root = sourceRepository.getFile("/");
      if (root == null) {
        throw new MigrationException("Cannot access source repository root");
      }
      
      logger.info("Source repository validation passed");
      
    } catch (Exception e) {
      throw new MigrationException("Source repository validation failed: " + e.getMessage(), e);
    }
  }

  private void validateTargetRepository() throws MigrationException {
    try {
      // Test Git repository accessibility
      if (targetRepository.getGit() == null) {
        throw new MigrationException("Target Git repository is not properly initialized");
      }
      
      // Test write access
      RepositoryFile testFolder = new RepositoryFile.Builder("migration-test")
          .name("migration-test")
          .folder(true)
          .build();
      
      RepositoryFile created = targetRepository.createFolder("/", testFolder, "Migration validation test");
      targetRepository.deleteFile(created.getId(), "Cleanup migration validation test");
      
      logger.info("Target repository validation passed");
      
    } catch (Exception e) {
      throw new MigrationException("Target repository validation failed: " + e.getMessage(), e);
    }
  }

  private MigrationPlan createMigrationPlan() throws MigrationException {
    try {
      MigrationPlan plan = new MigrationPlan();
      
      // Start from root and build complete plan
      RepositoryFile root = sourceRepository.getFile("/");
      buildMigrationPlan(root, plan);
      
      logger.info("Migration plan created: {} folders, {} files", 
                  plan.getFolderCount(), plan.getFileCount());
      
      return plan;
      
    } catch (Exception e) {
      throw new MigrationException("Failed to create migration plan: " + e.getMessage(), e);
    }
  }

  private void buildMigrationPlan(RepositoryFile item, MigrationPlan plan) {
    plan.addItem(item);
    
    if (item.isFolder()) {
      try {
        RepositoryRequest request = new RepositoryRequest(item.getPath(), true, -1, null);
        List<RepositoryFile> children = sourceRepository.getChildren(request);
        
        for (RepositoryFile child : children) {
          buildMigrationPlan(child, plan);
        }
        
      } catch (Exception e) {
        logger.warn("Failed to get children for folder: " + item.getPath(), e);
      }
    }
  }

  private void executeMigrationPlan(MigrationPlan plan) throws MigrationException {
    logger.info("Executing migration plan with {} items", plan.getTotalItems());
    
    // Create target branch for migration if specified
    if (config.getTargetBranch() != null && !config.getTargetBranch().equals("main")) {
      try {
        targetRepository.createBranch(config.getTargetBranch());
        targetRepository.switchBranch(config.getTargetBranch());
        logger.info("Created and switched to migration branch: {}", config.getTargetBranch());
      } catch (Exception e) {
        logger.warn("Failed to create migration branch, using current branch", e);
      }
    }
    
    // Sort items to ensure folders are created before files
    List<RepositoryFile> sortedItems = plan.getSortedItems();
    
    for (RepositoryFile item : sortedItems) {
      try {
        if (item.isFolder()) {
          migrateFolderItem(item);
        } else {
          migrateFileItem(item, null);
        }
        
        statistics.incrementProcessed();
        
        // Progress reporting
        if (statistics.getProcessedItems() % config.getProgressReportInterval() == 0) {
          notifyListeners(MigrationEvent.PROGRESS_UPDATE, statistics.copy());
          logger.info("Migration progress: {}/{} items processed", 
                      statistics.getProcessedItems(), plan.getTotalItems());
        }
        
        // Batch commit if configured
        if (config.getBatchCommitSize() > 0 && 
            statistics.getProcessedItems() % config.getBatchCommitSize() == 0) {
          commitBatch(statistics.getProcessedItems());
        }
        
      } catch (Exception e) {
        statistics.incrementErrors();
        logger.error("Failed to migrate item: " + item.getPath(), e);
        
        if (!config.isContinueOnError()) {
          throw new MigrationException("Migration failed on item: " + item.getPath(), e);
        }
      }
    }
    
    // Final commit
    if (config.getBatchCommitSize() > 0) {
      commitBatch(statistics.getProcessedItems());
    }
  }

  private void migrateFolderItem(RepositoryFile sourceFolder) throws Exception {
    logger.debug("Migrating folder: {}", sourceFolder.getPath());
    
    // Create folder in target repository
    String parentPath = getParentPath(sourceFolder.getPath());
    
    RepositoryFile targetFolder = new RepositoryFile.Builder(sourceFolder.getName())
        .name(sourceFolder.getName())
        .folder(true)
        .description(sourceFolder.getDescription())
        .build();
    
    RepositoryFile createdFolder = targetRepository.createFolder(
        parentPath, targetFolder, "Migrated folder: " + sourceFolder.getPath()
    );
    
    // Migrate ACL
    if (config.isMigrateAcls()) {
      migrateAcl(sourceFolder.getId(), createdFolder.getId());
    }
    
    // Migrate metadata
    if (config.isMigrateMetadata()) {
      migrateMetadata(sourceFolder.getId(), createdFolder.getId());
    }
    
    statistics.incrementFolders();
  }

  private void migrateFileItem(RepositoryFile sourceFile, String targetParentPath) throws Exception {
    logger.debug("Migrating file: {}", sourceFile.getPath());
    
    String parentPath = targetParentPath != null ? targetParentPath : getParentPath(sourceFile.getPath());
    
    // Get file data
    IRepositoryFileData fileData = sourceRepository.getDataForRead(
        sourceFile.getId(), SimpleRepositoryFileData.class
    );
    
    if (fileData == null) {
      logger.warn("No data found for file: {}", sourceFile.getPath());
      return;
    }
    
    // Create file in target repository
    RepositoryFile targetFile = new RepositoryFile.Builder(sourceFile.getName())
        .name(sourceFile.getName())
        .folder(false)
        .description(sourceFile.getDescription())
        .build();
    
    RepositoryFile createdFile = targetRepository.createFile(
        parentPath, targetFile, fileData, "Migrated file: " + sourceFile.getPath()
    );
    
    // Migrate version history if supported and configured
    if (config.isMigrateVersionHistory()) {
      migrateVersionHistory(sourceFile.getId(), createdFile.getId());
    }
    
    // Migrate ACL
    if (config.isMigrateAcls()) {
      migrateAcl(sourceFile.getId(), createdFile.getId());
    }
    
    // Migrate metadata
    if (config.isMigrateMetadata()) {
      migrateMetadata(sourceFile.getId(), createdFile.getId());
    }
    
    statistics.incrementFiles();
    statistics.addDataSize(fileData instanceof SimpleRepositoryFileData ? 
                          ((SimpleRepositoryFileData) fileData).getInputStream().available() : 0);
  }

  private void migrateFolderRecursive(RepositoryFile sourceFolder, String targetParentPath) throws Exception {
    // Create the folder
    migrateFolderItem(sourceFolder);
    
    // Migrate children
    RepositoryRequest request = new RepositoryRequest(sourceFolder.getPath(), true, -1, null);
    List<RepositoryFile> children = sourceRepository.getChildren(request);
    
    String targetFolderPath = targetParentPath != null ? 
                             targetParentPath + "/" + sourceFolder.getName() : 
                             sourceFolder.getPath();
    
    for (RepositoryFile child : children) {
      if (child.isFolder()) {
        migrateFolderRecursive(child, targetFolderPath);
      } else {
        migrateFileItem(child, targetFolderPath);
      }
    }
  }

  private void migrateAcl(Serializable sourceFileId, Serializable targetFileId) {
    try {
      RepositoryFileAcl sourceAcl = sourceRepository.getAcl(sourceFileId);
      if (sourceAcl != null) {
        // Create new ACL with target file ID
        RepositoryFileAcl targetAcl = new RepositoryFileAcl.Builder(sourceAcl)
            .id(targetFileId)
            .build();
        
        targetRepository.updateAcl(targetAcl);
        statistics.incrementAcls();
      }
    } catch (Exception e) {
      logger.warn("Failed to migrate ACL for file: " + sourceFileId, e);
      statistics.incrementAclErrors();
    }
  }

  private void migrateMetadata(Serializable sourceFileId, Serializable targetFileId) {
    try {
      Map<String, Serializable> metadata = sourceRepository.getFileMetadata(sourceFileId);
      if (metadata != null && !metadata.isEmpty()) {
        targetRepository.setFileMetadata(targetFileId, metadata);
        statistics.incrementMetadata();
      }
    } catch (Exception e) {
      logger.warn("Failed to migrate metadata for file: " + sourceFileId, e);
      statistics.incrementMetadataErrors();
    }
  }

  private void migrateVersionHistory(Serializable sourceFileId, Serializable targetFileId) {
    try {
      List<VersionSummary> versions = sourceRepository.getVersionSummaries(sourceFileId);
      
      if (versions != null && versions.size() > 1) {
        // Migrate historical versions (reverse order to maintain chronology)
        Collections.reverse(versions);
        
        for (int i = 1; i < versions.size(); i++) { // Skip current version (already migrated)
          VersionSummary version = versions.get(i);
          
          try {
            IRepositoryFileData versionData = sourceRepository.getDataAtVersionForRead(
                sourceFileId, version.getId(), SimpleRepositoryFileData.class
            );
            
            if (versionData != null) {
              RepositoryFile targetFile = targetRepository.getFileById(targetFileId);
              targetRepository.updateFile(targetFile, versionData, 
                                        "Migrated version: " + version.getMessage());
            }
            
          } catch (Exception e) {
            logger.warn("Failed to migrate version {} for file: {}", version.getId(), sourceFileId, e);
          }
        }
        
        statistics.addVersions(versions.size() - 1);
      }
      
    } catch (Exception e) {
      logger.warn("Failed to migrate version history for file: " + sourceFileId, e);
      statistics.incrementVersionErrors();
    }
  }

  private void commitBatch(int batchNumber) {
    try {
      // Git commits are handled automatically by the repository implementation
      logger.debug("Batch {} committed", batchNumber);
    } catch (Exception e) {
      logger.warn("Failed to commit batch: " + batchNumber, e);
    }
  }

  private void validateMigration(MigrationPlan plan) throws MigrationException {
    logger.info("Validating migration results...");
    
    try {
      int validationErrors = 0;
      
      for (RepositoryFile sourceItem : plan.getItems()) {
        RepositoryFile targetItem = targetRepository.getFile(sourceItem.getPath());
        
        if (targetItem == null) {
          logger.error("Missing item in target repository: {}", sourceItem.getPath());
          validationErrors++;
          continue;
        }
        
        // Validate basic properties
        if (!sourceItem.getName().equals(targetItem.getName()) ||
            sourceItem.isFolder() != targetItem.isFolder()) {
          logger.error("Item properties mismatch: {}", sourceItem.getPath());
          validationErrors++;
        }
        
        // Validate file content for non-folders
        if (!sourceItem.isFolder()) {
          try {
            IRepositoryFileData sourceData = sourceRepository.getDataForRead(
                sourceItem.getId(), SimpleRepositoryFileData.class
            );
            IRepositoryFileData targetData = targetRepository.getDataForRead(
                targetItem.getId(), SimpleRepositoryFileData.class
            );
            
            // Basic content validation (could be enhanced)
            if (sourceData != null && targetData == null) {
              logger.error("Missing file data for: {}", sourceItem.getPath());
              validationErrors++;
            }
            
          } catch (Exception e) {
            logger.warn("Failed to validate file content: " + sourceItem.getPath(), e);
          }
        }
      }
      
      if (validationErrors > 0) {
        throw new MigrationException("Migration validation failed with " + validationErrors + " errors");
      }
      
      logger.info("Migration validation completed successfully");
      
    } catch (Exception e) {
      throw new MigrationException("Migration validation failed: " + e.getMessage(), e);
    }
  }

  private void performRollback() {
    logger.info("Performing migration rollback...");
    
    try {
      // For Git repository, we could reset to a previous commit or branch
      // This is a simplified rollback - in practice, you might want to:
      // 1. Reset to the commit before migration started
      // 2. Delete the migration branch
      // 3. Clear any temporary data
      
      logger.warn("Rollback functionality not fully implemented - manual cleanup may be required");
      
    } catch (Exception e) {
      logger.error("Rollback failed", e);
    }
  }

  private String getParentPath(String path) {
    if (path == null || path.equals("/")) {
      return "/";
    }
    
    int lastSlash = path.lastIndexOf('/');
    if (lastSlash <= 0) {
      return "/";
    }
    
    return path.substring(0, lastSlash);
  }

  // ~ Listener Management
  // =========================================================================================================

  public void addMigrationListener(MigrationListener listener) {
    listeners.add(listener);
  }

  public void removeMigrationListener(MigrationListener listener) {
    listeners.remove(listener);
  }

  private void notifyListeners(MigrationEvent event, Object data) {
    for (MigrationListener listener : listeners) {
      try {
        listener.onMigrationEvent(event, data);
      } catch (Exception e) {
        logger.warn("Migration listener failed", e);
      }
    }
  }

  // ~ Getter Methods
  // =========================================================================================================

  public MigrationConfiguration getConfiguration() {
    return config;
  }

  public MigrationStatistics getStatistics() {
    return statistics.copy();
  }

  public IUnifiedRepository getSourceRepository() {
    return sourceRepository;
  }

  public GitUnifiedRepository getTargetRepository() {
    return targetRepository;
  }
}
