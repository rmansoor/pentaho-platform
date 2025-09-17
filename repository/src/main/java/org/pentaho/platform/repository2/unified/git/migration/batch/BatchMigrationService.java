package org.pentaho.platform.repository2.unified.git.migration.batch;

import org.pentaho.platform.api.repository2.unified.IUnifiedRepository;
import org.pentaho.platform.api.repository2.unified.RepositoryFile;
import org.pentaho.platform.repository2.unified.git.GitUnifiedRepository;
import org.pentaho.platform.repository2.unified.git.migration.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.batch.core.*;
import org.springframework.batch.core.configuration.annotation.JobBuilderFactory;
import org.springframework.batch.core.configuration.annotation.StepBuilderFactory;
import org.springframework.batch.core.launch.JobLauncher;
import org.springframework.batch.core.repository.JobRepository;
import org.springframework.batch.item.ItemProcessor;
import org.springframework.batch.item.ItemReader;
import org.springframework.batch.item.ItemWriter;
import org.springframework.batch.item.support.ListItemReader;

import java.util.List;

/**
 * Spring Batch-based migration service for large-scale repository migrations.
 * 
 * This service provides:
 * - Scalable batch processing
 * - Restart capability for failed migrations  
 * - Chunk-based processing for memory efficiency
 * - Progress tracking and monitoring
 * - Transaction management
 * 
 * Suitable for very large repositories where the simple migration approach
 * might face memory or performance constraints.
 * 
 * @author Migration Framework
 */
public class BatchMigrationService {

  private static final Logger logger = LoggerFactory.getLogger(BatchMigrationService.class);

  private final JobBuilderFactory jobBuilderFactory;
  private final StepBuilderFactory stepBuilderFactory;
  private final JobLauncher jobLauncher;
  private final JobRepository jobRepository;

  public BatchMigrationService(JobBuilderFactory jobBuilderFactory,
                              StepBuilderFactory stepBuilderFactory,
                              JobLauncher jobLauncher,
                              JobRepository jobRepository) {
    this.jobBuilderFactory = jobBuilderFactory;
    this.stepBuilderFactory = stepBuilderFactory;
    this.jobLauncher = jobLauncher;
    this.jobRepository = jobRepository;
  }

  /**
   * Creates and executes a batch migration job.
   * 
   * @param sourceRepository the source repository
   * @param targetRepository the target Git repository
   * @param config migration configuration
   * @return migration result
   * @throws Exception if migration fails
   */
  public MigrationResult performBatchMigration(IUnifiedRepository sourceRepository,
                                              GitUnifiedRepository targetRepository,
                                              MigrationConfiguration config) throws Exception {
    
    logger.info("Starting batch migration from {} to Git repository", 
                sourceRepository.getClass().getSimpleName());

    // Create migration plan
    MigrationPlan plan = createMigrationPlan(sourceRepository);
    
    // Build Spring Batch job
    Job migrationJob = createMigrationJob(sourceRepository, targetRepository, config, plan);
    
    // Execute job
    JobParameters jobParameters = new JobParametersBuilder()
        .addLong("startTime", System.currentTimeMillis())
        .addString("sourceType", sourceRepository.getClass().getSimpleName())
        .addString("targetDirectory", targetRepository.getWorkingDirectory().getAbsolutePath())
        .toJobParameters();

    JobExecution jobExecution = jobLauncher.run(migrationJob, jobParameters);
    
    // Convert job execution to migration result
    return convertJobExecutionToResult(jobExecution);
  }

  private MigrationPlan createMigrationPlan(IUnifiedRepository sourceRepository) throws Exception {
    MigrationPlan plan = new MigrationPlan();
    
    // Build complete migration plan starting from root
    RepositoryFile root = sourceRepository.getFile("/");
    buildPlanRecursive(sourceRepository, root, plan);
    
    logger.info("Created migration plan with {} items", plan.getTotalItems());
    return plan;
  }

  private void buildPlanRecursive(IUnifiedRepository sourceRepository, 
                                 RepositoryFile item, 
                                 MigrationPlan plan) {
    plan.addItem(item);
    
    if (item.isFolder()) {
      try {
        org.pentaho.platform.api.repository2.unified.RepositoryRequest request = 
            new org.pentaho.platform.api.repository2.unified.RepositoryRequest(item.getPath(), true, -1, null);
        List<RepositoryFile> children = sourceRepository.getChildren(request);
        for (RepositoryFile child : children) {
          buildPlanRecursive(sourceRepository, child, plan);
        }
      } catch (Exception e) {
        logger.warn("Failed to get children for folder: " + item.getPath(), e);
      }
    }
  }

  private Job createMigrationJob(IUnifiedRepository sourceRepository,
                                GitUnifiedRepository targetRepository,
                                MigrationConfiguration config,
                                MigrationPlan plan) {
    
    // Create folder migration step
    Step folderMigrationStep = createFolderMigrationStep(sourceRepository, targetRepository, config, plan);
    
    // Create file migration step  
    Step fileMigrationStep = createFileMigrationStep(sourceRepository, targetRepository, config, plan);
    
    // Create validation step (optional)
    Step validationStep = createValidationStep(sourceRepository, targetRepository, plan);

    // Build job with steps
    JobBuilder jobBuilder = jobBuilderFactory.get("repositoryMigrationJob")
        .start(folderMigrationStep)
        .next(fileMigrationStep);
    
    if (config.isValidateAfterMigration()) {
      jobBuilder = jobBuilder.next(validationStep);
    }
    
    return jobBuilder.build();
  }

  private Step createFolderMigrationStep(IUnifiedRepository sourceRepository,
                                        GitUnifiedRepository targetRepository,
                                        MigrationConfiguration config,
                                        MigrationPlan plan) {
    
    // Get only folders from the plan
    List<RepositoryFile> folders = plan.getSortedItems().stream()
        .filter(RepositoryFile::isFolder)
        .collect(java.util.stream.Collectors.toList());

    ItemReader<RepositoryFile> reader = new ListItemReader<>(folders);
    
    ItemProcessor<RepositoryFile, MigrationItem> processor = new FolderMigrationProcessor(
        sourceRepository, config
    );
    
    ItemWriter<MigrationItem> writer = new FolderMigrationWriter(targetRepository, config);

    return stepBuilderFactory.get("folderMigrationStep")
        .<RepositoryFile, MigrationItem>chunk(config.getBatchCommitSize())
        .reader(reader)
        .processor(processor)
        .writer(writer)
        .build();
  }

  private Step createFileMigrationStep(IUnifiedRepository sourceRepository,
                                      GitUnifiedRepository targetRepository,
                                      MigrationConfiguration config,
                                      MigrationPlan plan) {
    
    // Get only files from the plan
    List<RepositoryFile> files = plan.getSortedItems().stream()
        .filter(item -> !item.isFolder())
        .collect(java.util.stream.Collectors.toList());

    ItemReader<RepositoryFile> reader = new ListItemReader<>(files);
    
    ItemProcessor<RepositoryFile, MigrationItem> processor = new FileMigrationProcessor(
        sourceRepository, config
    );
    
    ItemWriter<MigrationItem> writer = new FileMigrationWriter(targetRepository, config);

    return stepBuilderFactory.get("fileMigrationStep")
        .<RepositoryFile, MigrationItem>chunk(config.getBatchCommitSize())
        .reader(reader)
        .processor(processor)
        .writer(writer)
        .build();
  }

  private Step createValidationStep(IUnifiedRepository sourceRepository,
                                   GitUnifiedRepository targetRepository,
                                   MigrationPlan plan) {
    
    List<RepositoryFile> items = plan.getItems();
    ItemReader<RepositoryFile> reader = new ListItemReader<>(items);
    
    ItemProcessor<RepositoryFile, ValidationResult> processor = new ValidationProcessor(
        sourceRepository, targetRepository
    );
    
    ItemWriter<ValidationResult> writer = new ValidationWriter();

    return stepBuilderFactory.get("validationStep")
        .<RepositoryFile, ValidationResult>chunk(100)
        .reader(reader)
        .processor(processor)
        .writer(writer)
        .build();
  }

  private MigrationResult convertJobExecutionToResult(JobExecution jobExecution) {
    BatchStatus batchStatus = jobExecution.getStatus();
    boolean successful = batchStatus == BatchStatus.COMPLETED;
    
    // Extract statistics from job execution context
    MigrationStatistics statistics = new MigrationStatistics();
    
    // In a real implementation, you would extract actual statistics
    // from the job execution context or step execution contexts
    
    Exception error = null;
    if (!successful) {
      List<Throwable> failureExceptions = jobExecution.getFailureExceptions();
      if (!failureExceptions.isEmpty()) {
        Throwable cause = failureExceptions.get(0);
        error = cause instanceof Exception ? (Exception) cause : new Exception(cause);
      }
    }
    
    return new MigrationResult(successful, statistics, error);
  }

  // Item classes for batch processing
  private static class MigrationItem {
    private final RepositoryFile sourceFile;
    private final Object data;
    private final String targetPath;

    public MigrationItem(RepositoryFile sourceFile, Object data, String targetPath) {
      this.sourceFile = sourceFile;
      this.data = data;
      this.targetPath = targetPath;
    }

    public RepositoryFile getSourceFile() { return sourceFile; }
    public Object getData() { return data; }
    public String getTargetPath() { return targetPath; }
  }

  private static class ValidationResult {
    private final RepositoryFile sourceFile;
    private final boolean valid;
    private final String message;

    public ValidationResult(RepositoryFile sourceFile, boolean valid, String message) {
      this.sourceFile = sourceFile;
      this.valid = valid;
      this.message = message;
    }

    public RepositoryFile getSourceFile() { return sourceFile; }
    public boolean isValid() { return valid; }
    public String getMessage() { return message; }
  }

  // Processor implementations
  private static class FolderMigrationProcessor implements ItemProcessor<RepositoryFile, MigrationItem> {
    private final IUnifiedRepository sourceRepository;
    private final MigrationConfiguration config;

    public FolderMigrationProcessor(IUnifiedRepository sourceRepository, MigrationConfiguration config) {
      this.sourceRepository = sourceRepository;
      this.config = config;
    }

    @Override
    public MigrationItem process(RepositoryFile item) throws Exception {
      logger.debug("Processing folder: {}", item.getPath());
      
      // Folder processing logic
      return new MigrationItem(item, null, item.getPath());
    }
  }

  private static class FileMigrationProcessor implements ItemProcessor<RepositoryFile, MigrationItem> {
    private final IUnifiedRepository sourceRepository;
    private final MigrationConfiguration config;

    public FileMigrationProcessor(IUnifiedRepository sourceRepository, MigrationConfiguration config) {
      this.sourceRepository = sourceRepository;
      this.config = config;
    }

    @Override
    public MigrationItem process(RepositoryFile item) throws Exception {
      logger.debug("Processing file: {}", item.getPath());
      
      // Get file data
      Object fileData = sourceRepository.getDataForRead(item.getId(), Object.class);
      
      return new MigrationItem(item, fileData, item.getPath());
    }
  }

  private static class ValidationProcessor implements ItemProcessor<RepositoryFile, ValidationResult> {
    private final IUnifiedRepository sourceRepository;
    private final GitUnifiedRepository targetRepository;

    public ValidationProcessor(IUnifiedRepository sourceRepository, GitUnifiedRepository targetRepository) {
      this.sourceRepository = sourceRepository;
      this.targetRepository = targetRepository;
    }

    @Override
    public ValidationResult process(RepositoryFile item) throws Exception {
      // Validation logic
      RepositoryFile targetItem = targetRepository.getFile(item.getPath());
      
      if (targetItem == null) {
        return new ValidationResult(item, false, "Item not found in target repository");
      }
      
      if (item.isFolder() != targetItem.isFolder()) {
        return new ValidationResult(item, false, "Item type mismatch");
      }
      
      return new ValidationResult(item, true, "Valid");
    }
  }

  // Writer implementations
  private static class FolderMigrationWriter implements ItemWriter<MigrationItem> {
    private final GitUnifiedRepository targetRepository;
    private final MigrationConfiguration config;

    public FolderMigrationWriter(GitUnifiedRepository targetRepository, MigrationConfiguration config) {
      this.targetRepository = targetRepository;
      this.config = config;
    }

    @Override
    public void write(List<? extends MigrationItem> items) throws Exception {
      for (MigrationItem item : items) {
        RepositoryFile sourceFile = item.getSourceFile();
        logger.debug("Creating folder: {}", sourceFile.getPath());
        
        String parentPath = getParentPath(sourceFile.getPath());
        
        RepositoryFile targetFolder = new RepositoryFile.Builder(sourceFile.getName())
            .name(sourceFile.getName())
            .folder(true)
            .description(sourceFile.getDescription())
            .build();
        
        targetRepository.createFolder(parentPath, targetFolder, "Migrated folder: " + sourceFile.getPath());
      }
    }

    private String getParentPath(String path) {
      if (path == null || path.equals("/")) return "/";
      int lastSlash = path.lastIndexOf('/');
      return lastSlash <= 0 ? "/" : path.substring(0, lastSlash);
    }
  }

  private static class FileMigrationWriter implements ItemWriter<MigrationItem> {
    private final GitUnifiedRepository targetRepository;
    private final MigrationConfiguration config;

    public FileMigrationWriter(GitUnifiedRepository targetRepository, MigrationConfiguration config) {
      this.targetRepository = targetRepository;
      this.config = config;
    }

    @Override
    public void write(List<? extends MigrationItem> items) throws Exception {
      for (MigrationItem item : items) {
        RepositoryFile sourceFile = item.getSourceFile();
        logger.debug("Creating file: {}", sourceFile.getPath());
        
        String parentPath = getParentPath(sourceFile.getPath());
        
        RepositoryFile targetFile = new RepositoryFile.Builder(sourceFile.getName())
            .name(sourceFile.getName())
            .folder(false)
            .description(sourceFile.getDescription())
            .build();
        
        targetRepository.createFile(parentPath, targetFile, 
                                   (org.pentaho.platform.api.repository2.unified.IRepositoryFileData) item.getData(), 
                                   "Migrated file: " + sourceFile.getPath());
      }
    }

    private String getParentPath(String path) {
      if (path == null || path.equals("/")) return "/";
      int lastSlash = path.lastIndexOf('/');
      return lastSlash <= 0 ? "/" : path.substring(0, lastSlash);
    }
  }

  private static class ValidationWriter implements ItemWriter<ValidationResult> {
    @Override
    public void write(List<? extends ValidationResult> items) throws Exception {
      for (ValidationResult result : items) {
        if (!result.isValid()) {
          logger.error("Validation failed for {}: {}", result.getSourceFile().getPath(), result.getMessage());
        }
      }
    }
  }
}
