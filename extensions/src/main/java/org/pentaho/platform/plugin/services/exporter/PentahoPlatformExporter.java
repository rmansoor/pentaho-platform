/*! ******************************************************************************
 *
 * Pentaho
 *
 * Copyright (C) 2024 by Hitachi Vantara, LLC : http://www.pentaho.com
 *
 * Use of this software is governed by the Business Source License included
 * in the LICENSE.TXT file.
 *
 * Change Date: 2028-08-13
 ******************************************************************************/


package org.pentaho.platform.plugin.services.exporter;

import org.apache.commons.io.IOUtils;
import org.apache.commons.lang.StringEscapeUtils;
import org.pentaho.database.model.IDatabaseConnection;
import org.pentaho.di.core.exception.KettleException;
import org.pentaho.metadata.repository.IMetadataDomainRepository;
import org.pentaho.metastore.api.IMetaStore;
import org.pentaho.metastore.stores.xml.XmlMetaStore;
import org.pentaho.metastore.util.MetaStoreUtil;
import org.pentaho.platform.api.engine.IUserRoleListService;
import org.pentaho.platform.api.mt.ITenant;
import org.pentaho.platform.api.repository.datasource.DatasourceMgmtServiceException;
import org.pentaho.platform.api.repository.datasource.IDatasourceMgmtService;
import org.pentaho.platform.api.repository2.unified.IUnifiedRepository;
import org.pentaho.platform.api.repository2.unified.RepositoryFile;
import org.pentaho.platform.api.scheduler2.IScheduler;
import org.pentaho.platform.api.usersettings.IAnyUserSettingService;
import org.pentaho.platform.api.usersettings.IUserSettingService;
import org.pentaho.platform.api.usersettings.pojo.IUserSetting;
import org.pentaho.platform.api.importexport.ExportException;
import org.pentaho.platform.api.importexport.IExportHelper;
import org.pentaho.platform.api.util.IPentahoPlatformExporter;
import org.pentaho.platform.engine.core.system.PentahoSystem;
import org.pentaho.platform.engine.core.system.TenantUtils;
import org.pentaho.platform.plugin.action.mondrian.catalog.IMondrianCatalogService;
import org.pentaho.platform.plugin.action.mondrian.catalog.MondrianCatalog;
import org.pentaho.platform.plugin.services.exporter.PentahoPlatformExporter;
import org.pentaho.platform.plugin.services.exporter.DatasourcesExportHelper;
import org.pentaho.platform.plugin.services.exporter.MetadataExportHelper;
import org.pentaho.platform.plugin.services.exporter.MetastoreExportHelper;
import org.pentaho.platform.plugin.services.exporter.MondrianExportHelper;
import org.pentaho.platform.plugin.services.exporter.RepositoryContentExportHelper;
import org.pentaho.platform.plugin.services.exporter.UsersAndRolesExportHelper;
import org.pentaho.platform.plugin.services.importexport.DatabaseConnectionConverter;
import org.pentaho.platform.plugin.services.importexport.DefaultExportHandler;
import org.pentaho.platform.plugin.services.importexport.ExportFileNameEncoder;
import org.pentaho.platform.plugin.services.importexport.BackupComponentConfig;
import org.pentaho.platform.plugin.services.importexport.BackupInventory;
import org.pentaho.platform.plugin.services.importexport.InventoryLogger;
import org.pentaho.platform.plugin.services.importexport.ImportExportLogger;
import org.pentaho.platform.plugin.services.importexport.ImportExportMetricsCollector;
import org.pentaho.platform.plugin.services.importexport.ImportExportMetrics;
import org.pentaho.platform.plugin.services.importexport.ExportManifestUserSetting;
import org.pentaho.platform.plugin.services.importexport.RoleExport;
import org.pentaho.platform.plugin.services.importexport.UserExport;
import org.pentaho.platform.plugin.services.importexport.ZipExportProcessor;
import org.pentaho.platform.plugin.services.importexport.exportManifest.Parameters;
import org.pentaho.platform.plugin.services.importexport.exportManifest.bindings.ExportManifestMetaStore;
import org.pentaho.platform.plugin.services.importexport.exportManifest.bindings.ExportManifestMetadata;
import org.pentaho.platform.plugin.services.importexport.exportManifest.bindings.ExportManifestMondrian;
import org.pentaho.platform.plugin.services.importexport.legacy.MondrianCatalogRepositoryHelper;
import org.pentaho.platform.plugin.services.messages.Messages;
import org.pentaho.platform.plugin.services.metadata.IPentahoMetadataDomainRepositoryExporter;
import org.pentaho.platform.repository.solution.filebased.MondrianVfs;
import org.pentaho.platform.repository2.ClientRepositoryPaths;
import org.pentaho.platform.security.policy.rolebased.IRoleAuthorizationPolicyRoleBindingDao;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.core.userdetails.UserDetailsService;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileNotFoundException;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.Serializable;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.StreamSupport;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

public class PentahoPlatformExporter extends ZipExportProcessor implements IPentahoPlatformExporter {

  private static final Logger log = LoggerFactory.getLogger( PentahoPlatformExporter.class );

  public static final String ROOT = "/";
  public static final String DATA_SOURCES_PATH_IN_ZIP = "_datasources/";
  public static final String METADATA_PATH_IN_ZIP = DATA_SOURCES_PATH_IN_ZIP + "metadata/";
  public static final String ANALYSIS_PATH_IN_ZIP = DATA_SOURCES_PATH_IN_ZIP + "analysis/";
  public static final String CONNECTIONS_PATH_IN_ZIP = DATA_SOURCES_PATH_IN_ZIP + "connections/";
  public static final String METASTORE = "metastore";
  public static final String METASTORE_BACKUP_EXT = ".mzip";

  protected ZipOutputStream zos;

  private IScheduler scheduler;
  private IMetadataDomainRepository metadataDomainRepository;
  private IDatasourceMgmtService datasourceMgmtService;
  private IMondrianCatalogService mondrianCatalogService;
  private MondrianCatalogRepositoryHelper mondrianCatalogRepositoryHelper;
  private IMetaStore metastore;
  private IUserSettingService userSettingService;
  private BackupComponentConfig componentConfig;
  private BackupInventory backupInventory;
  private InventoryLogger inventoryLogger;
  private ImportExportLogger importExportLogger;
  private ImportExportMetricsCollector metricsCollector;
  private ImportExportMetrics exportMetrics;  // New comprehensive metrics collector
  private int exportedFileCount = 0;  // Track total files exported
  private int exportedFolderCount = 0;  // Track total folders exported
  private long exportStartTime = 0;  // Track export start time for duration calculation

  private List<IExportHelper> exportHelpers = new ArrayList<>();

  public PentahoPlatformExporter( IUnifiedRepository repository ) {
    super( ROOT, repository, true );
    setUnifiedRepository( repository );
    addExportHandler( new DefaultExportHandler() );
    
    // Register built-in export helpers
    registerBuiltInExportHelpers( repository );
  }

  /**
   * Register built-in export helpers for standard components.
   * These helpers provide profile-based filtering for selective exports.
   */
  protected void registerBuiltInExportHelpers( IUnifiedRepository repository ) {
    // Register helpers in order of typical export flow
    addExportHelper( new RepositoryContentExportHelper( this, repository ) );
    addExportHelper( new DatasourcesExportHelper( this ) );
    addExportHelper( new MetadataExportHelper( this ) );
    addExportHelper( new MondrianExportHelper( this ) );
    addExportHelper( new UsersAndRolesExportHelper( this ) );
    addExportHelper( new MetastoreExportHelper( this ) );
  }

  public File performExport() throws ExportException, IOException {
    if ( componentConfig == null ) {
      componentConfig = BackupComponentConfig.fullSystem();
    }
    return this.performExport( null );
  }

  /**
   * Perform selective export based on component configuration
   */
  public File performSelectiveExport( RepositoryFile exportRepositoryFile, BackupComponentConfig config )
    throws ExportException, IOException {
    this.componentConfig = config;
    getRepositoryExportLogger().info( "Starting selective export: " + config.toString() );
    return this.performExport( exportRepositoryFile );
  }

  /**
   * Perform selective export of root directory
   */
  public File performSelectiveExport( BackupComponentConfig config ) throws ExportException, IOException {
    return performSelectiveExport( null, config );
  }

  public void addExportHelper( IExportHelper helper ) {
    exportHelpers.add( helper );
  }

  /**
   * Run all registered export helpers with profile-based filtering and metrics tracking.
   * Each helper determines if it should execute based on component configuration.
   */
  public void runComponentExportHelpers() {
    for ( IExportHelper helper : exportHelpers ) {
      try {
        String helperName = helper.getName();
        
        // Check if this is a built-in component helper (not a schedule/user-settings helper)
        if ( isComponentExportHelper( helper ) ) {
          getRepositoryExportLogger().debug( "Running component export helper: " + helperName );
          helper.doExport( this );
          recordComponentExportSuccess( helperName );
        }
      } catch ( ExportException exportException ) {
        getRepositoryExportLogger().error( "Error performing export of component [ " + helper.getName() + " ] Cause [ " + exportException.getLocalizedMessage() + " ]" );
        recordComponentExportFailure( helper.getName(), exportException );
      } catch ( Exception e ) {
        getRepositoryExportLogger().error( "Unexpected error in export helper [ " + helper.getName() + " ]: " + e.getMessage(), e );
        recordComponentExportFailure( helper.getName(), e );
      }
    }
  }

  /**
   * Run non-component export helpers (schedules, user settings).
   * These helpers run only if their specific profile settings are enabled.
   */
  public void runExportHelpers() {
    for ( IExportHelper helper : exportHelpers ) {
      try {
        String helperName = helper.getName();
        
        // Filter to only run non-component helpers
        if ( !isComponentExportHelper( helper ) ) {
          if ( "Scheduler".equals( helperName ) && !componentConfig.isIncludeSchedules() ) {
            getRepositoryExportLogger().debug( "Skipping " + helperName + " export (not included in backup configuration)" );
            continue;
          }
          
          if ( "EmailsGroups".equals( helperName ) && !componentConfig.isIncludeUserSettings() ) {
            getRepositoryExportLogger().debug( "Skipping " + helperName + " export (not included in backup configuration)" );
            continue;
          }
          
          getRepositoryExportLogger().info( "Running export helper: " + helperName );
          helper.doExport( this );
        }
      } catch ( ExportException exportException ) {
        getRepositoryExportLogger().error( "Error performing backup of component [ " + helper.getName() + " ] Cause [ " + exportException.getLocalizedMessage() + " ]" );
      }
    }
  }

  /**
   * Determine if a helper is a built-in component helper (not a schedule/user-settings helper).
   */
  private boolean isComponentExportHelper( IExportHelper helper ) {
    String name = helper.getName();
    return name.contains( "Exporter" ) && 
           !name.equals( "Scheduler" ) && 
           !name.equals( "EmailsGroups" );
  }

  /**
   * Record successful export of a component.
   */
  private void recordComponentExportSuccess( String helperName ) {
    if ( "RepositoryContentExporter".equals( helperName ) ) {
      exportMetrics.recordSuccess( ImportExportMetrics.Category.FILES );
    } else if ( "DatasourcesExporter".equals( helperName ) ) {
      exportMetrics.recordSuccess( ImportExportMetrics.Category.DATASOURCES );
    } else if ( "MetadataExporter".equals( helperName ) ) {
      exportMetrics.recordSuccess( ImportExportMetrics.Category.METADATA );
    } else if ( "MondrianExporter".equals( helperName ) ) {
      exportMetrics.recordSuccess( ImportExportMetrics.Category.MONDRIAN );
    } else if ( "UsersAndRolesExporter".equals( helperName ) ) {
      exportMetrics.recordSuccess( ImportExportMetrics.Category.USERS );
    } else if ( "MetastoreExporter".equals( helperName ) ) {
      exportMetrics.recordSuccess( ImportExportMetrics.Category.METASTORE );
    }
  }

  /**
   * Record failed export of a component.
   */
  private void recordComponentExportFailure( String helperName, Exception exception ) {
    if ( "RepositoryContentExporter".equals( helperName ) ) {
      exportMetrics.recordFailure( ImportExportMetrics.Category.FILES, "repository", exception );
    } else if ( "DatasourcesExporter".equals( helperName ) ) {
      exportMetrics.recordFailure( ImportExportMetrics.Category.DATASOURCES, "datasources", exception );
    } else if ( "MetadataExporter".equals( helperName ) ) {
      exportMetrics.recordFailure( ImportExportMetrics.Category.METADATA, "models", exception );
    } else if ( "MondrianExporter".equals( helperName ) ) {
      exportMetrics.recordFailure( ImportExportMetrics.Category.MONDRIAN, "schemas", exception );
    } else if ( "UsersAndRolesExporter".equals( helperName ) ) {
      exportMetrics.recordFailure( ImportExportMetrics.Category.USERS, "users", exception );
    } else if ( "MetastoreExporter".equals( helperName ) ) {
      exportMetrics.recordFailure( ImportExportMetrics.Category.METASTORE, "metastore", exception );
    }
  }

  /**
   * Export a specific file from the repository to the export bundle.
   * Used by export helpers to export files referenced by other components (e.g., files referenced by schedules).
   * 
   * @param repositoryFilePath the repository path of the file to export
   * @throws ExportException if the file cannot be exported
   */
  public void exportFileByPath( String repositoryFilePath ) throws ExportException {
    if ( repositoryFilePath == null || repositoryFilePath.trim().isEmpty() ) {
      throw new ExportException( "Repository file path cannot be null or empty" );
    }
    
    try {
      IUnifiedRepository repository = getUnifiedRepository();
      if ( repository == null ) {
        throw new ExportException( "Unable to access unified repository" );
      }
      
      RepositoryFile file = repository.getFile( repositoryFilePath );
      if ( file == null ) {
        throw new ExportException( "File not found in repository: " + repositoryFilePath );
      }
      
      getRepositoryExportLogger().debug( "Exporting dependency file: " + repositoryFilePath );
      exportFileContent( file );
      getRepositoryExportLogger().debug( "Successfully exported dependency file: " + repositoryFilePath );
    } catch ( IOException e ) {
      throw new ExportException( "Error exporting file [ " + repositoryFilePath + " ]: " + e.getMessage(), e );
    }
  }

  /**
   * Performs the export process, returns a zip File object
   *
   * @throws ExportException indicates an error in import processing
   */
  @Override
  public File performExport( RepositoryFile exportRepositoryFile ) throws ExportException, IOException {

    // Initialize component config if not set (backward compatibility)
    if ( componentConfig == null ) {
      componentConfig = BackupComponentConfig.fullSystem();
    }

    // LOG COMPONENT CONFIG AT START
    getRepositoryExportLogger().info( "========== COMPONENT CONFIG AT EXPORT START ==========" );
    getRepositoryExportLogger().info( "  Content: " + componentConfig.isIncludeContent() );
    getRepositoryExportLogger().info( "  Users: " + componentConfig.isIncludeUsers() );
    getRepositoryExportLogger().info( "  Datasources: " + componentConfig.isIncludeDatasources() );
    getRepositoryExportLogger().info( "  Mondrian: " + componentConfig.isIncludeMondrian() );
    getRepositoryExportLogger().info( "  Metastore: " + componentConfig.isIncludeMetastore() );
    getRepositoryExportLogger().info( "  Schedules: " + componentConfig.isIncludeSchedules() );
    getRepositoryExportLogger().info( "  UserSettings: " + componentConfig.isIncludeUserSettings() );
    getRepositoryExportLogger().info( "  Generated Content: " + componentConfig.isIncludeGeneratedContent() );
    getRepositoryExportLogger().info( "=====================================================" );

    // Reset export counters
    resetExportCounters();

    // Initialize new logging framework
    metricsCollector = new ImportExportMetricsCollector();
    importExportLogger = new ImportExportLogger();
    exportMetrics = new ImportExportMetrics( ImportExportMetrics.OperationType.BACKUP );
    exportStartTime = System.currentTimeMillis();  // Track start time for duration calculation

    // Log backup start with config
    importExportLogger.logBackupStart( componentConfig );

    // Initialize backup inventory tracking (legacy)
    backupInventory = new BackupInventory("BACKUP");
    inventoryLogger = new InventoryLogger(getRepositoryExportLogger(), backupInventory, true);

    getRepositoryExportLogger().info( Messages.getInstance().getString( "PentahoPlatformExporter.INFO_START_EXPORT_PROCESS" ) );
    // always export root
    exportRepositoryFile = getUnifiedRepository().getFile( ROOT );

    // create temp file
    File exportFile = File.createTempFile( EXPORT_TEMP_FILENAME_PREFIX, EXPORT_TEMP_FILENAME_EXT );
    exportFile.deleteOnExit();

    zos = new ZipOutputStream( new FileOutputStream( exportFile ) );

    if ( componentConfig.isIncludeContent() ) {
      try {
        getRepositoryExportLogger().info( "Starting file and folder export..." );
        exportFileContent( exportRepositoryFile );
        // Track exported files as success
        exportMetrics.recordSuccess( ImportExportMetrics.Category.FILES );
        getRepositoryExportLogger().info( "File content export completed successfully" );
      } catch ( ExportException | IOException exception ) {
        getRepositoryExportLogger().error( Messages.getInstance().getString( "PentahoPlatformExporter.ERROR_EXPORT_FILE_CONTENT", exception.getLocalizedMessage() ) );
        exportMetrics.recordFailure( ImportExportMetrics.Category.FILES, "repository", exception );
        if ( inventoryLogger != null ) {
          inventoryLogger.logObjectFailure("CONTENT", "Repository Root", "REPOSITORY_FOLDER", exception.getMessage());
        }
      }
    } else {
      getRepositoryExportLogger().debug( "Skipping content export (not included in backup configuration)" );
      exportMetrics.recordSkip( ImportExportMetrics.Category.FILES, "repository", "Content export disabled" );
    }

    if ( componentConfig.isIncludeDatasources() ) {
      try {
        exportDatasources();
        exportMetrics.recordSuccess( ImportExportMetrics.Category.DATASOURCES );
      } catch ( Exception e ) {
        exportMetrics.recordFailure( ImportExportMetrics.Category.DATASOURCES, "datasources", e );
      }
    } else {
      exportMetrics.recordSkip( ImportExportMetrics.Category.DATASOURCES, "datasources", "Datasource export disabled" );
    }
    if ( componentConfig.isIncludeMondrian() ) {
      try {
        exportMondrianSchemas();
        exportMetrics.recordSuccess( ImportExportMetrics.Category.MONDRIAN );
      } catch ( Exception e ) {
        getRepositoryExportLogger().error( "Failed to export Mondrian schemas: " + e.getMessage(), e );
        exportMetrics.recordFailure( ImportExportMetrics.Category.MONDRIAN, "schemas", e );
      }
    } else {
      exportMetrics.recordSkip( ImportExportMetrics.Category.MONDRIAN, "schemas", "Mondrian export disabled" );
    }
    if ( componentConfig.isIncludeDatasources() ) {
      try {
        exportMetadataModels();
        exportMetrics.recordSuccess( ImportExportMetrics.Category.METADATA );
      } catch ( Exception e ) {
        getRepositoryExportLogger().error( "Failed to export metadata models: " + e.getMessage(), e );
        exportMetrics.recordFailure( ImportExportMetrics.Category.METADATA, "models", e );
      }
    } else {
      exportMetrics.recordSkip( ImportExportMetrics.Category.METADATA, "models", "Metadata export disabled" );
    }
    // Only run export helpers if any user-related settings are enabled
    if ( componentConfig.isIncludeSchedules() || componentConfig.isIncludeUserSettings() ) {
      runExportHelpers();
    }
    if ( componentConfig.isIncludeUsers() ) {
      try {
        exportUsersAndRoles();
        exportMetrics.recordSuccess( ImportExportMetrics.Category.USERS );
      } catch ( Exception e ) {
        exportMetrics.recordFailure( ImportExportMetrics.Category.USERS, "users", e );
      }
    } else {
      exportMetrics.recordSkip( ImportExportMetrics.Category.USERS, "users", "User export disabled" );
    }
    if ( componentConfig.isIncludeMetastore() ) {
      try {
        exportMetastore();
        exportMetrics.recordSuccess( ImportExportMetrics.Category.METASTORE );
      } catch ( Exception e ) {
        exportMetrics.recordFailure( ImportExportMetrics.Category.METASTORE, "metastore", e );
      }
    } else {
      exportMetrics.recordSkip( ImportExportMetrics.Category.METASTORE, "metastore", "Metastore export disabled" );
    }

    if ( this.withManifest ) {
      // write manifest to zip output stream
      ZipEntry entry = new ZipEntry( EXPORT_MANIFEST_FILENAME );
      zos.putNextEntry( entry );
      trackFileAdded( EXPORT_MANIFEST_FILENAME );

      // pass output stream to manifest class for writing
      try {
        getExportManifest().toXml( zos );
      } catch ( Exception e ) {
        // todo: add to messages.properties
        getRepositoryExportLogger().error( Messages.getInstance().getString( "PentahoPlatformExporter.ERROR_GENERATING_EXPORT_XML" ) );
      }

      zos.closeEntry();
    }

    zos.close();

    // Update inventory with file/folder statistics before logging
    if ( backupInventory != null ) {
      backupInventory.setExportFileStats( exportedFileCount, exportedFolderCount );
    }

    // Log final inventory report (legacy)
    if ( inventoryLogger != null ) {
      inventoryLogger.logOperationComplete();
    }

    // Log consolidated metrics summary (new framework)
    if ( metricsCollector != null ) {
      metricsCollector.printConsolidatedSummary();
    }
    
    // Log comprehensive export metrics report
    if ( exportMetrics != null ) {
      long endTime = System.currentTimeMillis();
      long duration = endTime - getStartTime();
      
      getRepositoryExportLogger().info( "" );
      getRepositoryExportLogger().info( "================================================================================" );
      getRepositoryExportLogger().info( "                    BACKUP OPERATION SUMMARY" );
      getRepositoryExportLogger().info( "================================================================================" );
      getRepositoryExportLogger().info( "Duration: " + formatDuration( duration ) );
      getRepositoryExportLogger().info( "" );
      getRepositoryExportLogger().info( exportMetrics.generateDetailedReport() );
      getRepositoryExportLogger().info( "" );
    }

    // Log file count statistics
    getRepositoryExportLogger().info( "Export Summary Statistics:" );
    getRepositoryExportLogger().info( "  Total Files Exported: " + exportedFileCount );
    getRepositoryExportLogger().info( "  Total Folders Exported: " + exportedFolderCount );
    getRepositoryExportLogger().info( "  Total Items Exported: " + getTotalExportedCount() );

    // clean up
    initManifest();
    zos = null;

    getRepositoryExportLogger().info( Messages.getInstance().getString( "PentahoPlatformExporter.INFO_END_EXPORT_PROCESS" ) );

    return exportFile;
  }

  protected void exportDatasources() {
    if ( !componentConfig.isIncludeDatasources() ) {
      getRepositoryExportLogger().debug( "Skipping datasources export (not included in backup configuration)" );
      return;
    }
    getRepositoryExportLogger().info( Messages.getInstance().getString( "PentahoPlatformExporter.INFO_START_EXPORT_JDBC_DATASOURCE" ) );
    // get all connection to export
    int successfulExportJDBCDSCount = 0;
    int failedCount = 0;
    int databaseConnectionsSize = 0;
    try {
      List<IDatabaseConnection> databaseConnections = getDatasourceMgmtService().getDatasources();
      if ( databaseConnections != null ) {
        databaseConnectionsSize = databaseConnections.size();
        getRepositoryExportLogger().info( Messages.getInstance().getString( "PentahoPlatformExporter.INFO_COUNT_JDBC_DATASOURCE_TO_EXPORT", databaseConnectionsSize ) );
        if ( metricsCollector != null ) {
          metricsCollector.addJdbcDatasources( databaseConnectionsSize );
        }
        if ( inventoryLogger != null ) {
          inventoryLogger.logComponentStart("Datasources", databaseConnectionsSize);
        }
      }
      for ( IDatabaseConnection datasource : databaseConnections ) {
        if ( datasource instanceof org.pentaho.database.model.DatabaseConnection ) {
          getRepositoryExportLogger().debug( "Starting to perform backup of datasource [ " + datasource.getName() + " ]" );
          try {
            getExportManifest().addDatasource( DatabaseConnectionConverter.model2export( datasource ) );
            getRepositoryExportLogger().debug( "Finished performing backup of datasource [ " + datasource.getName() + " ]" );
            successfulExportJDBCDSCount++;
            if ( exportMetrics != null ) {
              exportMetrics.recordSuccess( ImportExportMetrics.Category.DATASOURCES );
            }
            if ( inventoryLogger != null ) {
              inventoryLogger.logObjectSuccess("DATASOURCES", datasource.getName(), "DATASOURCE");
            }
            if ( backupInventory != null ) {
              backupInventory.recordSuccess("DATASOURCES", datasource.getName(), "DATASOURCE");
            }
          } catch ( Exception e ) {
            failedCount++;
            if ( exportMetrics != null ) {
              exportMetrics.recordFailure( ImportExportMetrics.Category.DATASOURCES, datasource.getName(), e );
            }
            if ( inventoryLogger != null ) {
              inventoryLogger.logObjectFailure("DATASOURCES", datasource.getName(), "DATASOURCE", e.getMessage());
            }
          }
        }
      }
    } catch ( DatasourceMgmtServiceException e ) {
      getRepositoryExportLogger().warn( "Unable to retrieve JDBC datasource(s). Cause [" + e.getMessage() + " ]" );
      getRepositoryExportLogger().debug( "Unable to retrieve JDBC datasource(s). Cause [" + e.getMessage() + " ]", e );
      if ( inventoryLogger != null ) {
        inventoryLogger.logObjectFailure("DATASOURCES", "All Datasources", "DATASOURCE_COLLECTION", e.getMessage());
      }
    }
    getRepositoryExportLogger().info( Messages.getInstance().getString( "PentahoPlatformExporter.INFO_SUCCESSFUL_JDBC_DATASOURCE_EXPORT_COUNT", successfulExportJDBCDSCount, databaseConnectionsSize ) );
    if ( metricsCollector != null ) {
      importExportLogger.logComponentComplete("Datasources", successfulExportJDBCDSCount, failedCount, 0);
    }
    if ( inventoryLogger != null ) {
      inventoryLogger.logComponentComplete("Datasources", "DATASOURCES", successfulExportJDBCDSCount, failedCount, 0);
    }

    getRepositoryExportLogger().info( Messages.getInstance().getString( "PentahoPlatformExporter.INFO_END_EXPORT_JDBC_DATASOURCE" ) );
  }

  protected void exportMetadataModels() {
    if ( !componentConfig.isIncludeDatasources() ) {
      getRepositoryExportLogger().debug( "Skipping metadata models export (datasources not included in backup configuration)" );
      return;
    }
    getRepositoryExportLogger().info( Messages.getInstance().getString( "PentahoPlatformExporter.INFO_START_EXPORT_METADATA" ) );
    int successfulExportMetadataDSCount = 0;
    int metadataDSSize = 0;
    // get all of the metadata models
    Set<String> domainIds = getMetadataDomainRepository().getDomainIds();
    if ( domainIds != null ) {
      metadataDSSize = domainIds.size();
      getRepositoryExportLogger().info( Messages.getInstance().getString( "PentahoPlatformExporter.INFO_COUNT_METADATA_DATASOURCE_TO_EXPORT", metadataDSSize ) );
    }

    for ( String domainId : domainIds ) {
      // get all of the files for this model
      Map<String, InputStream> domainFilesData = getDomainFilesData( domainId );
      getRepositoryExportLogger().debug( "Starting to backup metadata datasource [ " + domainId + " ]" );
      for ( String fileName : domainFilesData.keySet() ) {
        getRepositoryExportLogger().trace( "Adding metadata file [ " + fileName + " ]" );
        // write the file to the zip
        String metadataFilePath = METADATA_PATH_IN_ZIP + fileName;
        if ( !metadataFilePath.endsWith( ".xmi" ) ) {
          metadataFilePath += ".xmi";
        }
        String metadataZipEntryName = metadataFilePath;
        if ( this.withManifest ) {
          metadataZipEntryName = ExportFileNameEncoder.encodeZipPathName( metadataZipEntryName );
        }
        ZipEntry zipEntry = new ZipEntry( metadataZipEntryName );
        InputStream inputStream = domainFilesData.get( fileName );

        try {
          zos.putNextEntry( zipEntry );
          trackFileAdded( metadataZipEntryName );
          IOUtils.copy( inputStream, zos );

          // add the info to the exportManifest
          ExportManifestMetadata metadata = new ExportManifestMetadata();
          metadata.setDomainId( domainId );
          metadata.setFile( metadataFilePath );
          getExportManifest().addMetadata( metadata );
          successfulExportMetadataDSCount++;
        } catch ( IOException e ) {
          getRepositoryExportLogger().warn( Messages.getInstance().getString( "PentahoPlatformExporter.ERROR_METADATA_DATASOURCE_EXPORT", e.getMessage() ), e );
        } finally {
          IOUtils.closeQuietly( inputStream );
          try {
            zos.closeEntry();
          } catch ( IOException e ) {
            // can't close the entry of input stream
          }
        }
        getRepositoryExportLogger().trace( "Successfully added metadata file [ " + fileName + " ] to the manifest" );
      }
      getRepositoryExportLogger().debug( "Successfully perform backup of metadata datasource [ " + domainId + " ]" );
    }
    getRepositoryExportLogger().info( Messages.getInstance().getString( "PentahoPlatformExporter.INFO_SUCCESSFUL_METADATA_DATASOURCE_EXPORT_COUNT", successfulExportMetadataDSCount, metadataDSSize ) );

    getRepositoryExportLogger().info( Messages.getInstance().getString( "PentahoPlatformExporter.INFO_END_EXPORT_METADATA" ) );
  }

  protected void exportMondrianSchemas() {
    getRepositoryExportLogger().info( Messages.getInstance().getString( "PentahoPlatformExporter.INFO_START_EXPORT_MONDRIAN_DATASOURCE" ) );
    // Get the mondrian catalogs available in the repo
    int successfulExportMondrianDSCount = 0;
    int mondrianDSSize = 0;
    List<MondrianCatalog> catalogs = getMondrianCatalogService().listCatalogs( getSession(), false );
    if ( catalogs != null ) {
      mondrianDSSize = catalogs.size();
      getRepositoryExportLogger().info( Messages.getInstance().getString( "PentahoPlatformExporter.INFO_COUNT_MONDRIAN_DATASOURCE_TO_EXPORT", mondrianDSSize ) );
    }
    for ( MondrianCatalog catalog : catalogs ) {
      getRepositoryExportLogger().debug( "Starting to perform backup mondrian datasource [ " + catalog.getName() + " ]" );
      // get the files for this catalog
      Map<String, InputStream> files = getMondrianCatalogRepositoryHelper().getModrianSchemaFiles( catalog.getName() );

      ExportManifestMondrian mondrian = new ExportManifestMondrian();
      for ( String fileName : files.keySet() ) {
        getRepositoryExportLogger().trace( "Starting to add filename [ " + fileName + " ] with datasource [" + catalog.getName() + " ] to the bundle" );

        // write the file to the zip
        String path = ANALYSIS_PATH_IN_ZIP + catalog.getName() + "/" + fileName;
        ZipEntry zipEntry = new ZipEntry( new ZipEntry( ExportFileNameEncoder.encodeZipPathName( path ) ) );
        InputStream inputStream = files.get( fileName );

        // ignore *.annotated.xml files, they are not needed
        if ( fileName.equals( "schema.annotated.xml" ) ) {
          // these types of files only exist for contextual export of a data source (from the UI) to later be imported in.
          // However, in the case of backup/restore we don't need these since we'll be using the annotations.xml file along
          // with the original schema xml file to re-generate the model properly
          continue;
        } else if ( MondrianVfs.ANNOTATIONS_XML.equals( fileName ) ) {
          // annotations.xml should be written to the zip file and referenced in the export manifest entry for the
          // related mondrian model
          mondrian.setAnnotationsFile( path );
        } else {
          // must be a true mondrian model
          mondrian.setCatalogName( catalog.getName() );
          boolean xmlaEnabled = parseXmlaEnabled( catalog.getDataSourceInfo() );
          mondrian.setXmlaEnabled( xmlaEnabled );
          mondrian.setFile( path );
          Parameters mondrianParameters = new Parameters();
          mondrianParameters.put( "Provider", "mondrian" );
          //DataSource can be escaped
          mondrianParameters.put( "DataSource", StringEscapeUtils.unescapeXml( catalog.getJndi() ) );
          mondrianParameters.put( "EnableXmla", Boolean.toString( xmlaEnabled ) );

          StreamSupport.stream( catalog.getConnectProperties().spliterator(), false )
              .filter( p -> !mondrianParameters.containsKey( p.getKey() ) )
              //if value is escaped it should be unescaped to avoid double escape after export in xml file, because
              //marshaller executes escaping as well
              .forEach( p -> mondrianParameters.put( p.getKey(), StringEscapeUtils.unescapeXml( p.getValue() ) ) );

          mondrian.setParameters( mondrianParameters );
        }

        try {
          zos.putNextEntry( zipEntry );
          trackFileAdded( path );
          IOUtils.copy( inputStream, zos );
        } catch ( IOException e ) {
          getRepositoryExportLogger().error( Messages.getInstance().getString( "PentahoPlatformExporter.ERROR_MONDRIAN_DATASOURCE_EXPORT" ) );
        } finally {
          IOUtils.closeQuietly( inputStream );
          try {
            zos.closeEntry();
          } catch ( IOException e ) {
            // can't close the entry of input stream
          }
        }
      }
      if ( mondrian.getCatalogName() != null && mondrian.getFile() != null ) {
        getExportManifest().addMondrian( mondrian );
        getRepositoryExportLogger().debug( "Successfully added filename [ " + mondrian.getFile() + " ] with catalog [" + mondrian.getCatalogName() + " ] to the bundle" );
        successfulExportMondrianDSCount++;
      }
    }
    getRepositoryExportLogger().info( Messages.getInstance().getString( "PentahoPlatformExporter.INFO_SUCCESSFUL_MONDRIAN_DATASOURCE_EXPORT_COUNT", successfulExportMondrianDSCount, mondrianDSSize ) );

    getRepositoryExportLogger().info( Messages.getInstance().getString( "PentahoPlatformExporter.INFO_END_EXPORT_MONDRIAN_DATASOURCE" ) );
  }

  protected boolean parseXmlaEnabled( String dataSourceInfo ) {
    String key = "EnableXmla=";
    int pos = dataSourceInfo.indexOf( key );
    if ( pos == -1 ) {
      // if not specified, assume false
      return false;
    }
    int end = dataSourceInfo.indexOf( ";", pos ) > -1 ? dataSourceInfo.indexOf( ";", pos ) : dataSourceInfo.length();
    String xmlaEnabled = dataSourceInfo.substring( pos + key.length(), end );
    return xmlaEnabled == null ? false : Boolean.parseBoolean( xmlaEnabled.replace( "\"", "" ) );
  }

  protected void exportUsersAndRoles() {
    getRepositoryExportLogger().info( Messages.getInstance().getString( "PentahoPlatformExporter.INFO_START_EXPORT_USER" ) );
    int successfulExportUsers = 0;
    int usersSize = 0;

    IUserRoleListService userRoleListService = PentahoSystem.get( IUserRoleListService.class );
    ITenant tenant = TenantUtils.getCurrentTenant();

    //User Export
    List<String> userList = userRoleListService.getAllUsers( tenant );
    if ( userList != null ) {
      usersSize = userList.size();
      getRepositoryExportLogger().info( Messages.getInstance().getString( "PentahoPlatformExporter.INFO_COUNT_USER_TO_EXPORT", usersSize ) );
      if ( metricsCollector != null ) {
        metricsCollector.addUsers( usersSize );
      }
    }
    
    // Export each user and their roles
    for ( String user : userList ) {
      if ( exportUserAndRole( user ) ) {
        successfulExportUsers++;
      }
    }

    // export the global user settings
    IUserSettingService service = getUserSettingService();
    if ( service != null ) {
      getRepositoryExportLogger().debug( "Starting backup of global user settings" );
      List<IUserSetting> globalUserSettings = service.getGlobalUserSettings();
      if ( globalUserSettings != null ) {
        for ( IUserSetting setting : globalUserSettings ) {
          getExportManifest().addGlobalUserSetting( new ExportManifestUserSetting( setting ) );
        }
      }
      getRepositoryExportLogger().debug( "Finished backup of global user settings" );
    }
    getRepositoryExportLogger().info( Messages.getInstance().getString( "PentahoPlatformExporter.INFO_SUCCESSFUL_USER_EXPORT_COUNT", successfulExportUsers, usersSize ) );

    getRepositoryExportLogger().info( Messages.getInstance().getString( "PentahoPlatformExporter.INFO_END_EXPORT_USER" ) );

    // Export roles
    exportRoles();
  }

  /**
   * Export a single user and their roles
   * @param username the username to export
   * @return true if the user was successfully exported, false otherwise
   */
  public boolean exportUserAndRole( String username ) {
    if ( username == null || username.trim().isEmpty() ) {
      return false;
    }

    UserDetailsService userDetailsService = PentahoSystem.get( UserDetailsService.class );
    IUserRoleListService userRoleListService = PentahoSystem.get( IUserRoleListService.class );
    ITenant tenant = TenantUtils.getCurrentTenant();
    IUserSettingService service = getUserSettingService();

    try {
      getRepositoryExportLogger().debug( "Starting backup of user [ " + username + " ] " );
      UserExport userExport = new UserExport();
      userExport.setUsername( username );
      userExport.setPassword( userDetailsService.loadUserByUsername( username ).getPassword() );

      for ( String role : userRoleListService.getRolesForUser( tenant, username ) ) {
        getRepositoryExportLogger().trace( "user [ " + username + " ] has an associated role [ " + role + " ]" );
        userExport.setRole( role );
      }

      if ( service != null && service instanceof IAnyUserSettingService ) {
        getRepositoryExportLogger().debug( "Starting backup of user specific settings for user [ " + username + " ] " );
        IAnyUserSettingService userSettings = (IAnyUserSettingService) service;
        List<IUserSetting> settings = userSettings.getUserSettings( username );
        if ( settings != null ) {
          for ( IUserSetting setting : settings ) {
            try {
              getRepositoryExportLogger().debug( "Adding user specific setting [ "
                  + setting.getSettingName() + " ] with value [ " + setting.getSettingValue() + " ] to backup" );
              userExport.addUserSetting( new ExportManifestUserSetting( setting ) );
              getRepositoryExportLogger().debug( "Successfully added user specific setting [ "
                  + setting.getSettingName() + " ] with value [ " + setting.getSettingValue() + " ] to backup" );
            } catch ( Exception e ) {
              getRepositoryExportLogger().warn( "Failed to export user setting [ " + setting.getSettingName() + " ] for user [ " + username + " ]: " + e.getMessage() );
              // Continue with next setting
            }
          }
        }
        getRepositoryExportLogger().debug( "Finished backup of user specific settings for user [ " + username + " ] " );
      }

      this.getExportManifest().addUserExport( userExport );
      if ( exportMetrics != null ) {
        exportMetrics.recordSuccess( ImportExportMetrics.Category.USERS );
      }
      getRepositoryExportLogger().debug( "Successfully perform backup of user [ " + username + " ] " );
      return true;
    } catch ( Exception e ) {
      getRepositoryExportLogger().error( "Failed to export user [ " + username + " ]: " + e.getMessage(), e );
      if ( exportMetrics != null ) {
        exportMetrics.recordFailure( ImportExportMetrics.Category.USERS, username, e );
      }
      return false;
    }
  }

  /**
   * Export all roles in the system
   */
  protected void exportRoles() {
    getRepositoryExportLogger().info( Messages.getInstance().getString( "PentahoPlatformExporter.INFO_START_EXPORT_ROLE" ) );
    int successfulExportRoles = 0;
    int rolesSize = 0;

    IUserRoleListService userRoleListService = PentahoSystem.get( IUserRoleListService.class );
    IRoleAuthorizationPolicyRoleBindingDao roleBindingDao = PentahoSystem.get(
        IRoleAuthorizationPolicyRoleBindingDao.class );

    //RoleExport
    List<String> roles = userRoleListService.getAllRoles();
    if ( roles != null ) {
      rolesSize = roles.size();
      getRepositoryExportLogger().info( Messages.getInstance().getString( "PentahoPlatformExporter.INFO_COUNT_ROLE_TO_EXPORT", rolesSize ) );
      if ( metricsCollector != null ) {
        metricsCollector.addRoles( rolesSize );
      }
    }
    for ( String role : roles ) {
      try {
        getRepositoryExportLogger().debug( "Starting backup of role [ " + role + " ] " );
        RoleExport roleExport = new RoleExport();
        roleExport.setRolename( role );
        roleExport.setPermission( roleBindingDao.getRoleBindingStruct( null ).bindingMap.get( role ) );
        exportManifest.addRoleExport( roleExport );
        successfulExportRoles++;
        if ( exportMetrics != null ) {
          exportMetrics.recordSuccess( ImportExportMetrics.Category.ROLES );
        }
        getRepositoryExportLogger().debug( "Finished backup of role [ " + role + " ] " );
      } catch ( Exception e ) {
        getRepositoryExportLogger().error( "Failed to export role [ " + role + " ]: " + e.getMessage(), e );
        if ( exportMetrics != null ) {
          exportMetrics.recordFailure( ImportExportMetrics.Category.ROLES, role, e );
        }
        // Continue with next role
      }
    }
    getRepositoryExportLogger().info( Messages.getInstance().getString( "PentahoPlatformExporter.INFO_SUCCESSFUL_ROLE_EXPORT_COUNT", successfulExportRoles, rolesSize ) );

    getRepositoryExportLogger().info( Messages.getInstance().getString( "PentahoPlatformExporter.INFO_END_EXPORT_ROLE" ) );
  }

  /**
   * Export only selected users and their roles (used by plugins like scheduler to export dependencies)
   * @param selectedUsernames Set of usernames to export
   */
  public void exportScheduleOwnersAndRoles( Set<String> selectedUsernames ) {
    if ( selectedUsernames == null || selectedUsernames.isEmpty() ) {
      return;
    }
    
    getRepositoryExportLogger().info( "Exporting schedule owner users" );
    int successfulExportUsers = 0;

    IUserRoleListService userRoleListService = PentahoSystem.get( IUserRoleListService.class );
    UserDetailsService userDetailsService = PentahoSystem.get( UserDetailsService.class );
    IRoleAuthorizationPolicyRoleBindingDao roleBindingDao = PentahoSystem.get(
        IRoleAuthorizationPolicyRoleBindingDao.class );
    ITenant tenant = TenantUtils.getCurrentTenant();

    if ( userRoleListService == null || userDetailsService == null ) {
      getRepositoryExportLogger().warn( "Could not export schedule owners: UserRoleListService or UserDetailsService not available" );
      return;
    }

    // Export only the selected users
    Set<String> exportedRoles = new HashSet<>();
    for ( String username : selectedUsernames ) {
      try {
        getRepositoryExportLogger().debug( "Exporting schedule owner user [ " + username + " ]" );
        UserExport userExport = new UserExport();
        userExport.setUsername( username );
        
        try {
          userExport.setPassword( userDetailsService.loadUserByUsername( username ).getPassword() );
        } catch ( Exception e ) {
          getRepositoryExportLogger().warn( "Could not load password for user [ " + username + " ]: " + e.getMessage() );
          // Continue - user will still be exported without password
        }
        
        // Add the user's roles
        for ( String role : userRoleListService.getRolesForUser( tenant, username ) ) {
          getRepositoryExportLogger().trace( "Schedule owner [ " + username + " ] has role [ " + role + " ]" );
          userExport.setRole( role );
          exportedRoles.add( role );
        }
        
        getExportManifest().addUserExport( userExport );
        successfulExportUsers++;
        if ( exportMetrics != null ) {
          exportMetrics.recordSuccess( ImportExportMetrics.Category.USERS );
        }
        getRepositoryExportLogger().debug( "Successfully exported schedule owner user [ " + username + " ]" );
      } catch ( Exception e ) {
        getRepositoryExportLogger().warn( "Failed to export schedule owner user [ " + username + " ]: " + e.getMessage(), e );
        if ( exportMetrics != null ) {
          exportMetrics.recordFailure( ImportExportMetrics.Category.USERS, username, e );
        }
        // Continue with next user
      }
    }

    // Export only the roles referenced by the selected users
    for ( String role : exportedRoles ) {
      try {
        getRepositoryExportLogger().debug( "Exporting role [ " + role + " ] for schedule owners" );
        RoleExport roleExport = new RoleExport();
        roleExport.setRolename( role );
        if ( roleBindingDao != null ) {
          roleExport.setPermission( roleBindingDao.getRoleBindingStruct( null ).bindingMap.get( role ) );
        }
        getExportManifest().addRoleExport( roleExport );
        if ( exportMetrics != null ) {
          exportMetrics.recordSuccess( ImportExportMetrics.Category.ROLES );
        }
        getRepositoryExportLogger().debug( "Successfully exported role [ " + role + " ]" );
      } catch ( Exception e ) {
        getRepositoryExportLogger().warn( "Failed to export role [ " + role + " ]: " + e.getMessage(), e );
        if ( exportMetrics != null ) {
          exportMetrics.recordFailure( ImportExportMetrics.Category.ROLES, role, e );
        }
        // Continue with next role
      }
    }

    getRepositoryExportLogger().info( "Successfully exported " + successfulExportUsers + " schedule owner users" );
  }

  protected void exportMetastore() throws IOException {
    getRepositoryExportLogger().info( Messages.getInstance().getString( "PentahoPlatformExporter.INFO_START_EXPORT_METASTORE" ) );
    try {
      getRepositoryExportLogger().debug( "Starting to copy metastore to a temp location" );
      Path tempDirectory = Files.createTempDirectory( METASTORE );
      IMetaStore xmlMetaStore = new XmlMetaStore( tempDirectory.toString() );
      MetaStoreUtil.copy( getRepoMetaStore(), xmlMetaStore );
      getRepositoryExportLogger().debug( "Finished to copying metastore to a temp location" );
      getRepositoryExportLogger().debug( "Starting to zip the metastore" );
      File zippedMetastore = Files.createTempFile( METASTORE, EXPORT_TEMP_FILENAME_EXT ).toFile();
      ZipOutputStream zipOutputStream = new ZipOutputStream( new FileOutputStream( zippedMetastore ) );
      zipFolder( tempDirectory.toFile(), zipOutputStream, tempDirectory.toString() );
      zipOutputStream.close();
      getRepositoryExportLogger().debug( "Finished zipping the metastore" );
      // now that we have the zipped content of an xml metastore, we need to write that to the export bundle
      FileInputStream zis = new FileInputStream( zippedMetastore );
      String zipFileLocation = METASTORE + METASTORE_BACKUP_EXT;
      ZipEntry metastoreZipFileZipEntry = new ZipEntry( zipFileLocation );
      getRepositoryExportLogger().debug( "Starting to add the metastore zip to the bundle" );
      zos.putNextEntry( metastoreZipFileZipEntry );
      trackFileAdded( zipFileLocation );
      try {
        IOUtils.copy( zis, zos );
        getRepositoryExportLogger().debug( "Finished adding the metastore zip to the bundle" );
      } catch ( IOException e ) {
        throw e;
      } finally {
        zis.close();
        zos.closeEntry();
      }
      getRepositoryExportLogger().debug( "Starting to add the metastore to the manifest" );
      // add an ExportManifest entry for the metastore.
      ExportManifestMetaStore exportManifestMetaStore = new ExportManifestMetaStore( zipFileLocation,
          getRepoMetaStore().getName(),
          getRepoMetaStore().getDescription() );

      getExportManifest().setMetaStore( exportManifestMetaStore );

      zippedMetastore.deleteOnExit();
      tempDirectory.toFile().deleteOnExit();
      getRepositoryExportLogger().info( Messages.getInstance().getString( "PentahoPlatformExporter.INFO_SUCCESSFUL_EXPORT_METASTORE" ) );
    } catch ( Exception e ) {
      getRepositoryExportLogger().error( Messages.getInstance().getString( "PentahoPlatformExporter.ERROR.ExportingMetaStore" ) );
      getRepositoryExportLogger().debug( Messages.getInstance().getString( "PentahoPlatformExporter.ERROR.ExportingMetaStore" ), e );
    }
    getRepositoryExportLogger().info( Messages.getInstance().getString( "PentahoPlatformExporter.INFO_END_EXPORT_METASTORE" ) );
  }

  protected IMetaStore getRepoMetaStore() {
    if ( metastore == null ) {
      try {
        metastore = MetaStoreExportUtil.connectToRepository( null ).getRepositoryMetaStore();
      } catch ( KettleException e ) {
        // can't get the metastore to import into
        getRepositoryExportLogger().debug( "Can't get the metastore to import into" );

      }
    }
    return metastore;
  }

  protected void setRepoMetaStore( IMetaStore metastore ) {
    this.metastore = metastore;
  }

  protected void zipFolder( File file, ZipOutputStream zos, String pathPrefixToRemove ) {
    if ( file.isDirectory() ) {
      File[] listFiles = file.listFiles();
      for ( File listFile : listFiles ) {
        if ( listFile.isDirectory() ) {
          zipFolder( listFile, zos, pathPrefixToRemove );
        } else {
          if ( !pathPrefixToRemove.endsWith( File.separator ) ) {
            pathPrefixToRemove += File.separator;
          }
          String path = listFile.getPath().replace( pathPrefixToRemove, "" );
          ZipEntry entry = new ZipEntry( path );
          FileInputStream fis = null;
          try {
            zos.putNextEntry( entry );
            trackFileAdded( path );
            fis = new FileInputStream( listFile );
            IOUtils.copy( fis, zos );
          } catch ( IOException e ) {
            e.printStackTrace();
          } finally {
            try {
              zos.closeEntry();
            } catch ( IOException e ) {
              e.printStackTrace();
            }
            IOUtils.closeQuietly( fis );
          }
        }
      }
    }
  }

  /**
   * Export file/folder content from the repository.
   * Refactored to handle folder exports independently with their own metadata.
   * Each folder is exported with its own ownership and ACLs, separate from files.
   */
  protected void exportFileContent( RepositoryFile exportRepositoryFile ) throws IOException, ExportException {
    getRepositoryExportLogger().info( Messages.getInstance().getString( "PentahoPlatformExporter.INFO_START_EXPORT_REPOSITORY_OBJECT" ) );
    // get the file path
    String filePath = new File( this.path ).getParent();
    if ( filePath == null ) {
      filePath = "/";
    }

    // send a response right away if not found
    if ( exportRepositoryFile == null ) {
      // todo: add to messages.properties
      throw new FileNotFoundException( "JCR file not found: " + this.path );
    }

    if ( exportRepositoryFile.isFolder() ) { // Handle recursive export
      getRepositoryExportLogger().trace( "Repository object [ " + exportRepositoryFile.getName() + "] is a folder" );
      getExportManifest().getManifestInformation().setRootFolder( path.substring( 0, path.lastIndexOf( "/" ) + 1 ) );

      getRepositoryExportLogger().debug( "Starting recursive backup of a folder [ " + exportRepositoryFile.getName() + " ]" );
      exportFolderHierarchyWithMetadata( exportRepositoryFile, zos, filePath );

    } else {
      getRepositoryExportLogger().trace( "Repository object [ " + exportRepositoryFile.getName() + "] is a file" );
      getExportManifest().getManifestInformation().setRootFolder( path.substring( 0, path.lastIndexOf( "/" ) + 1 ) );

      try {
        getRepositoryExportLogger().debug( "Starting backup of a file [ " + exportRepositoryFile.getName() + " ]" );
        exportFile( exportRepositoryFile, zos, filePath );
      } catch ( ExportException | IOException exception ) {
        getRepositoryExportLogger().error( Messages.getInstance().getString( "PentahoPlatformExporter.ERROR_EXPORT_REPOSITORY_OBJECT", exportRepositoryFile.getName() ) );
      } finally {
        getRepositoryExportLogger().debug( "Finished the backup of a file [ " + exportRepositoryFile.getName() + " ]" );
      }
    }
    getRepositoryExportLogger().info( Messages.getInstance().getString( "PentahoPlatformExporter.INFO_END_EXPORT_REPOSITORY_OBJECT" ) );
  }

  /**
   * Export folder hierarchy with independent metadata for each folder.
   * This ensures each folder retains its own ownership and ACLs,
   * separate from the files it contains.
   * 
   * @param folder the folder to export
   * @param zos the zip output stream
   * @param basePath the base path for export
   * @throws IOException if I/O error occurs
   * @throws ExportException if export error occurs
   */
  protected void exportFolderHierarchyWithMetadata( RepositoryFile folder, ZipOutputStream zos, String basePath ) 
      throws IOException, ExportException {
    
    if ( !folder.isFolder() ) {
      return;
    }
    
    // Export the current folder's metadata independently
    exportFolderMetadata( folder, zos, basePath );
    
    // Get all children of this folder
    List<RepositoryFile> children = getUnifiedRepository().getChildren( folder.getId() );
    
    if ( children != null ) {
      for ( RepositoryFile child : children ) {
        if ( child.isFolder() ) {
          // Recursively export subfolders with their own metadata
          // This ensures each folder has independent ownership and ACLs
          try {
            getRepositoryExportLogger().debug( "Starting backup of subfolder [ " + child.getPath() + " ]" );
            exportFolderHierarchyWithMetadata( child, zos, basePath );
            getRepositoryExportLogger().debug( "Finished backup of subfolder [ " + child.getPath() + " ]" );
          } catch ( Exception e ) {
            getRepositoryExportLogger().error( "Error exporting subfolder [ " + child.getPath() + " ]: " + e.getMessage(), e );
            if ( exportMetrics != null ) {
              exportMetrics.recordFailure( ImportExportMetrics.Category.FILES, child.getPath(), e );
            }
            // Continue with next folder
          }
        } else {
          // Export files
          try {
            getRepositoryExportLogger().debug( "Starting backup of file [ " + child.getPath() + " ]" );
            exportFile( child, zos, basePath );
            getRepositoryExportLogger().debug( "Finished backup of file [ " + child.getPath() + " ]" );
          } catch ( ExportException | IOException e ) {
            getRepositoryExportLogger().error( "Error exporting file [ " + child.getPath() + " ]: " + e.getMessage(), e );
            if ( exportMetrics != null ) {
              exportMetrics.recordFailure( ImportExportMetrics.Category.FILES, child.getPath(), e );
            }
            // Continue with next file
          }
        }
      }
    }
  }

  /**
   * Export a single folder's metadata including its ownership and ACLs.
   * This captures the folder's metadata and ACLs independently of any files it may contain.
   * Does NOT create duplicate ZIP entries - addToManifest() handles ZIP entry creation.
   * 
   * @param folder the folder to export metadata for
   * @param zos the zip output stream
   * @param basePath the base path for export
   * @throws IOException if I/O error occurs
   */
  protected void exportFolderMetadata( RepositoryFile folder, ZipOutputStream zos, String basePath ) 
      throws IOException {
    
    try {
      // Don't export root folder 
      if ( ClientRepositoryPaths.getRootFolderPath().equals( folder.getPath() ) ) {
        getRepositoryExportLogger().trace( "Skipping root folder from explicit export" );
        return;
      }
      
      // Export folder metadata through the parent class method
      // This handles creating ZIP entry AND capturing ACLs and ownership information
      exportFolderAcls( folder );
      
      getRepositoryExportLogger().debug( "Successfully exported folder metadata for [ " + folder.getPath() + " ]" );
      
    } catch ( Exception e ) {
      getRepositoryExportLogger().error( "Error exporting folder metadata for [ " + folder.getPath() + " ]: " + e.getMessage(), e );
      throw new IOException( e );
    }
  }

  /**
   * Export folder ACLs and ownership information to the manifest.
   * This ensures folder permissions are captured independently from file permissions.
   * 
   * @param folder the folder whose ACLs should be exported
   */
  protected void exportFolderAcls( RepositoryFile folder ) {
    try {
      // Add folder metadata and ACLs to the manifest
      // This captures the folder's ACLs separately from file permissions
      addToManifest( folder );
      
      getRepositoryExportLogger().trace( "ACLs exported for folder [ " + folder.getPath() + " ]" );
    } catch ( Exception e ) {
      getRepositoryExportLogger().warn( "Could not export ACLs for folder [ " + folder.getPath() + " ]: " + e.getMessage(), e );
      // Continue - folder will still be exported even if ACLs fail
    }
  }

  protected Map<String, InputStream> getDomainFilesData( String domainId ) {
    return ( (IPentahoMetadataDomainRepositoryExporter) metadataDomainRepository ).getDomainFilesData( domainId );
  }

  public IScheduler getScheduler() {
    if ( scheduler == null ) {
      scheduler = PentahoSystem.get( IScheduler.class, "IScheduler2", null ); //$NON-NLS-1$
    }
    return scheduler;
  }

  public void setScheduler( IScheduler scheduler ) {
    this.scheduler = scheduler;
  }

  public IMetadataDomainRepository getMetadataDomainRepository() {
    if ( metadataDomainRepository == null ) {
      metadataDomainRepository = PentahoSystem.get( IMetadataDomainRepository.class, getSession() );
    }
    return metadataDomainRepository;
  }

  public void setMetadataDomainRepository( IMetadataDomainRepository metadataDomainRepository ) {
    this.metadataDomainRepository = metadataDomainRepository;
  }

  public IDatasourceMgmtService getDatasourceMgmtService() {
    if ( datasourceMgmtService == null ) {
      datasourceMgmtService = PentahoSystem.get( IDatasourceMgmtService.class, getSession() );
    }
    return datasourceMgmtService;
  }

  public void setDatasourceMgmtService( IDatasourceMgmtService datasourceMgmtService ) {
    this.datasourceMgmtService = datasourceMgmtService;
  }

  public MondrianCatalogRepositoryHelper getMondrianCatalogRepositoryHelper() {
    if ( this.mondrianCatalogRepositoryHelper == null ) {
      mondrianCatalogRepositoryHelper = new MondrianCatalogRepositoryHelper( getUnifiedRepository() );
    }
    return mondrianCatalogRepositoryHelper;
  }

  public void setMondrianCatalogRepositoryHelper(
      MondrianCatalogRepositoryHelper mondrianCatalogRepositoryHelper ) {
    this.mondrianCatalogRepositoryHelper = mondrianCatalogRepositoryHelper;
  }

  public IMondrianCatalogService getMondrianCatalogService() {
    if ( mondrianCatalogService == null ) {
      mondrianCatalogService = PentahoSystem.get( IMondrianCatalogService.class, getSession() );
    }
    return mondrianCatalogService;
  }

  public void setMondrianCatalogService(
      IMondrianCatalogService mondrianCatalogService ) {
    this.mondrianCatalogService = mondrianCatalogService;
  }

  public IUserSettingService getUserSettingService() {
    if ( userSettingService == null ) {
      userSettingService = PentahoSystem.get( IUserSettingService.class, getSession() );
    }
    return userSettingService;
  }

  public void setUserSettingService( IUserSettingService userSettingService ) {
    this.userSettingService = userSettingService;
  }

  public BackupComponentConfig getComponentConfig() {
    return componentConfig;
  }

  public void setComponentConfig( BackupComponentConfig componentConfig ) {
    this.componentConfig = componentConfig;
  }

  @Override
  protected boolean isExportCandidate( String path ) {
    if ( path == null ) {
      return false;
    }

    String etc = ClientRepositoryPaths.getEtcFolderPath();

    // we need to include the etc/operation_mart folder and sub folders
    // but NOT any other folders in /etc

    if ( path.startsWith( etc ) ) {
      // might need to export it...
      String etc_operations_mart = etc + RepositoryFile.SEPARATOR + "operations_mart";
      if ( path.equals( etc ) ) {
        return true;
      } else if ( path.startsWith( etc_operations_mart ) ) {
        return true;
      } else {
        return false;
      }
    }
    return true;
  }

  /**
   * Track file being added to ZIP export
   */
  public void trackFileAdded( String zipPath ) {
    exportedFileCount++;
    getRepositoryExportLogger().debug( "Added to ZIP [" + exportedFileCount + "]: " + zipPath );
  }

  /**
   * Track folder being added to ZIP export
   */
  public void trackFolderAdded( String zipPath ) {
    exportedFolderCount++;
    getRepositoryExportLogger().debug( "Added folder to ZIP [" + exportedFolderCount + "]: " + zipPath );
  }

  /**
   * Get total files exported
   */
  public int getExportedFileCount() {
    return exportedFileCount;
  }

  /**
   * Get total folders exported
   */
  public int getExportedFolderCount() {
    return exportedFolderCount;
  }

  /**
   * Get total items exported
   */
  public int getTotalExportedCount() {
    return exportedFileCount + exportedFolderCount;
  }

  /**
   * Reset export counters
   */
  private void resetExportCounters() {
    exportedFileCount = 0;
    exportedFolderCount = 0;
  }

  public ZipOutputStream getZipStream() {
    return zos;
  }

  /**
   * Override from ZipExportProcessor to implement generated content filtering.
   * Checks if a file is marked as generated content (has lineage-id metadata)
   * and should be excluded based on the component configuration.
   */
  @Override
  protected boolean shouldSkipGeneratedContent( RepositoryFile repositoryFile ) {
    // Skip filtering if no component config, or if content not included, or if generated content is included
    if ( componentConfig == null || !componentConfig.isIncludeContent() || componentConfig.isIncludeGeneratedContent() ) {
      return false;
    }
    
    // Now check if the file is marked as generated content by looking for lineage-id metadata
    try {
      IUnifiedRepository repo = getUnifiedRepository();
      if ( repo != null && repositoryFile != null && repositoryFile.getId() != null ) {
        java.util.Map<String, Serializable> metadata = repo.getFileMetadata( repositoryFile.getId() );
        if ( metadata != null && metadata.containsKey( "lineage-id" ) ) {
          getRepositoryExportLogger().debug( "Skipping generated content file: " + repositoryFile.getPath() );
          return true;  // This is generated content, skip it
        }
      }
    } catch ( Exception e ) {
      getRepositoryExportLogger().warn( "Error checking file metadata for generated content: " + e.getMessage(), e );
    }
    
    return false;  // Not generated content, don't skip
  }

  /**
   * Get the export start time
   */
  protected long getStartTime() {
    return exportStartTime;
  }

  /**
   * Format duration in milliseconds to human-readable format
   */
  private String formatDuration( long millis ) {
    if ( millis < 0 ) return "0ms";
    long seconds = ( millis / 1000 ) % 60;
    long minutes = ( millis / ( 1000 * 60 ) ) % 60;
    long hours = millis / ( 1000 * 60 * 60 );
    StringBuilder result = new StringBuilder();
    if ( hours > 0 ) {
      result.append( hours ).append( "h " );
    }
    if ( minutes > 0 || hours > 0 ) {
      result.append( minutes ).append( "m " );
    }
    result.append( seconds ).append( "s" );
    return result.toString();
  }

}
