package org.pentaho.platform.repository2.unified.git.migration.spring;

import org.pentaho.platform.api.repository2.unified.IUnifiedRepository;
import org.pentaho.platform.repository2.unified.git.GitUnifiedRepository;
import org.pentaho.platform.repository2.unified.git.migration.MigrationConfiguration;
import org.pentaho.platform.repository2.unified.git.migration.UnifiedRepositoryMigrationService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;

import java.io.File;

/**
 * Spring configuration for repository migration services.
 * 
 * This configuration provides:
 * - Migration service beans
 * - Multiple migration configurations for different scenarios
 * - Integration with existing repository configurations
 * 
 * @author Migration Framework
 */
@Configuration
public class MigrationConfiguration {

  private static final Logger logger = LoggerFactory.getLogger(MigrationConfiguration.class);

  @Autowired(required = false)
  @Qualifier("sourceRepository")
  private IUnifiedRepository sourceRepository;

  @Autowired(required = false)
  @Qualifier("targetGitRepository")
  private GitUnifiedRepository targetGitRepository;

  /**
   * Default migration configuration suitable for most scenarios.
   */
  @Bean(name = "defaultMigrationConfig")
  public org.pentaho.platform.repository2.unified.git.migration.MigrationConfiguration defaultMigrationConfiguration() {
    org.pentaho.platform.repository2.unified.git.migration.MigrationConfiguration config = 
        new org.pentaho.platform.repository2.unified.git.migration.MigrationConfiguration();
    
    config.setMigrateAcls(true);
    config.setMigrateMetadata(true);
    config.setMigrateVersionHistory(true);
    config.setContinueOnError(true);
    config.setValidateAfterMigration(true);
    config.setBatchCommitSize(100);
    config.setProgressReportInterval(50);
    
    return config;
  }

  /**
   * Fast migration configuration that skips non-essential data.
   */
  @Bean(name = "fastMigrationConfig")
  public org.pentaho.platform.repository2.unified.git.migration.MigrationConfiguration fastMigrationConfiguration() {
    org.pentaho.platform.repository2.unified.git.migration.MigrationConfiguration config = 
        new org.pentaho.platform.repository2.unified.git.migration.MigrationConfiguration();
    
    config.setMigrateAcls(false);
    config.setMigrateMetadata(false);
    config.setMigrateVersionHistory(false);
    config.setContinueOnError(true);
    config.setValidateAfterMigration(false);
    config.setBatchCommitSize(200);
    config.setProgressReportInterval(100);
    
    return config;
  }

  /**
   * Production migration configuration with full validation and rollback.
   */
  @Bean(name = "productionMigrationConfig")
  public org.pentaho.platform.repository2.unified.git.migration.MigrationConfiguration productionMigrationConfiguration() {
    org.pentaho.platform.repository2.unified.git.migration.MigrationConfiguration config = 
        new org.pentaho.platform.repository2.unified.git.migration.MigrationConfiguration();
    
    config.setMigrateAcls(true);
    config.setMigrateMetadata(true);
    config.setMigrateVersionHistory(true);
    config.setContinueOnError(false);
    config.setValidateAfterMigration(true);
    config.setRollbackOnFailure(true);
    config.setBatchCommitSize(50);
    config.setProgressReportInterval(25);
    config.setTargetBranch("migration-" + System.currentTimeMillis());
    
    return config;
  }

  /**
   * Migration service with default configuration.
   */
  @Bean(name = "migrationService")
  public UnifiedRepositoryMigrationService migrationService(
      @Qualifier("defaultMigrationConfig") org.pentaho.platform.repository2.unified.git.migration.MigrationConfiguration config) {
    
    if (sourceRepository == null) {
      logger.warn("Source repository not configured - migration service will require manual repository injection");
    }
    
    if (targetGitRepository == null) {
      logger.warn("Target Git repository not configured - migration service will require manual repository injection");
    }
    
    return new UnifiedRepositoryMigrationService(sourceRepository, targetGitRepository, config);
  }

  /**
   * Fast migration service for development/testing.
   */
  @Bean(name = "fastMigrationService")
  public UnifiedRepositoryMigrationService fastMigrationService(
      @Qualifier("fastMigrationConfig") org.pentaho.platform.repository2.unified.git.migration.MigrationConfiguration config) {
    
    return new UnifiedRepositoryMigrationService(sourceRepository, targetGitRepository, config);
  }

  /**
   * Production migration service with full validation.
   */
  @Bean(name = "productionMigrationService")
  public UnifiedRepositoryMigrationService productionMigrationService(
      @Qualifier("productionMigrationConfig") org.pentaho.platform.repository2.unified.git.migration.MigrationConfiguration config) {
    
    return new UnifiedRepositoryMigrationService(sourceRepository, targetGitRepository, config);
  }

  /**
   * Factory method for creating migration services with custom repositories.
   */
  @Bean(name = "migrationServiceFactory")
  public MigrationServiceFactory migrationServiceFactory() {
    return new MigrationServiceFactory();
  }

  /**
   * Factory for creating migration services with different repository combinations.
   */
  public static class MigrationServiceFactory {

    /**
     * Creates a migration service with custom repositories and default configuration.
     */
    public UnifiedRepositoryMigrationService createMigrationService(
        IUnifiedRepository sourceRepo, GitUnifiedRepository targetRepo) {
      
      org.pentaho.platform.repository2.unified.git.migration.MigrationConfiguration config = 
          new org.pentaho.platform.repository2.unified.git.migration.MigrationConfiguration();
      
      return new UnifiedRepositoryMigrationService(sourceRepo, targetRepo, config);
    }

    /**
     * Creates a migration service with custom repositories and configuration.
     */
    public UnifiedRepositoryMigrationService createMigrationService(
        IUnifiedRepository sourceRepo, 
        GitUnifiedRepository targetRepo,
        org.pentaho.platform.repository2.unified.git.migration.MigrationConfiguration config) {
      
      return new UnifiedRepositoryMigrationService(sourceRepo, targetRepo, config);
    }

    /**
     * Creates a Git repository from a directory path.
     */
    public GitUnifiedRepository createGitRepository(String gitDirectoryPath) throws Exception {
      File gitDir = new File(gitDirectoryPath);
      
      if (!gitDir.exists()) {
        throw new IllegalArgumentException("Git directory does not exist: " + gitDirectoryPath);
      }
      
      if (!new File(gitDir, ".git").exists()) {
        throw new IllegalArgumentException("Directory is not a Git repository: " + gitDirectoryPath);
      }
      
      return new GitUnifiedRepository(gitDir);
    }

    /**
     * Creates a migration service for JCR to Git migration.
     */
    public UnifiedRepositoryMigrationService createJcrToGitMigration(
        IUnifiedRepository jcrRepository, String gitDirectoryPath) throws Exception {
      
      GitUnifiedRepository gitRepo = createGitRepository(gitDirectoryPath);
      
      org.pentaho.platform.repository2.unified.git.migration.MigrationConfiguration config = 
          new org.pentaho.platform.repository2.unified.git.migration.MigrationConfiguration();
      
      // JCR-specific configuration
      config.setMigrateAcls(true);
      config.setMigrateMetadata(true);
      config.setMigrateVersionHistory(true);
      config.setTargetBranch("jcr-migration");
      config.setCommitMessage("JCR to Git migration");
      
      return new UnifiedRepositoryMigrationService(jcrRepository, gitRepo, config);
    }

    /**
     * Creates a migration service for FileSystem to Git migration.
     */
    public UnifiedRepositoryMigrationService createFileSystemToGitMigration(
        IUnifiedRepository fileSystemRepository, String gitDirectoryPath) throws Exception {
      
      GitUnifiedRepository gitRepo = createGitRepository(gitDirectoryPath);
      
      org.pentaho.platform.repository2.unified.git.migration.MigrationConfiguration config = 
          new org.pentaho.platform.repository2.unified.git.migration.MigrationConfiguration();
      
      // FileSystem-specific configuration
      config.setMigrateAcls(false); // FileSystem repos typically don't have ACLs
      config.setMigrateMetadata(true);
      config.setMigrateVersionHistory(false); // FileSystem repos typically don't have version history
      config.setTargetBranch("filesystem-migration");
      config.setCommitMessage("FileSystem to Git migration");
      
      return new UnifiedRepositoryMigrationService(fileSystemRepository, gitRepo, config);
    }
  }
}
