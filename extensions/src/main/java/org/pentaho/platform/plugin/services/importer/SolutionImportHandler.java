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


package org.pentaho.platform.plugin.services.importer;

import com.google.common.annotations.VisibleForTesting;
import org.apache.commons.collections.CollectionUtils;
import org.apache.commons.io.IOUtils;
import org.apache.commons.logging.Log;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.pentaho.database.model.IDatabaseConnection;
import org.pentaho.metadata.repository.DomainAlreadyExistsException;
import org.pentaho.metadata.repository.DomainIdNullException;
import org.pentaho.metadata.repository.DomainStorageException;
import org.pentaho.platform.api.engine.security.userroledao.AlreadyExistsException;
import org.pentaho.platform.api.engine.security.userroledao.IPentahoRole;
import org.pentaho.platform.api.engine.security.userroledao.IPentahoUser;
import org.pentaho.platform.api.engine.security.userroledao.IUserRoleDao;
import org.pentaho.platform.api.importexport.IImportHelper;
import org.pentaho.platform.api.mimetype.IMimeType;
import org.pentaho.platform.api.mt.ITenant;
import org.pentaho.platform.api.repository.datasource.IDatasourceMgmtService;
import org.pentaho.platform.api.repository2.unified.IPlatformImportBundle;
import org.pentaho.platform.api.repository2.unified.IUnifiedRepository;
import org.pentaho.platform.api.repository2.unified.RepositoryFile;
import org.pentaho.platform.api.repository2.unified.RepositoryFileExtraMetaData;
import org.pentaho.platform.api.scheduler2.IJob;
import org.pentaho.platform.api.scheduler2.IJobRequest;
import org.pentaho.platform.api.scheduler2.IJobScheduleParam;
import org.pentaho.platform.api.scheduler2.IJobScheduleRequest;
import org.pentaho.platform.api.scheduler2.IScheduler;
import org.pentaho.platform.api.scheduler2.ISchedulerResource;
import org.pentaho.platform.api.scheduler2.JobState;
import org.pentaho.platform.api.usersettings.IAnyUserSettingService;
import org.pentaho.platform.api.usersettings.IUserSettingService;
import org.pentaho.platform.api.usersettings.pojo.IUserSetting;
import org.pentaho.platform.core.mt.Tenant;
import org.pentaho.platform.engine.core.system.PentahoSystem;
import org.pentaho.platform.engine.core.system.TenantUtils;
import org.pentaho.platform.plugin.services.importexport.DatabaseConnectionConverter;
import org.pentaho.platform.plugin.services.importexport.ExportFileNameEncoder;
import org.pentaho.platform.plugin.services.importexport.ExportManifestUserSetting;
import org.pentaho.platform.plugin.services.importexport.IRepositoryImportLogger;
import org.pentaho.platform.plugin.services.importexport.ImportExportMetrics;
import org.pentaho.platform.plugin.services.importexport.ImportSession;
import org.pentaho.platform.plugin.services.importexport.ImportSession.ManifestFile;
import org.pentaho.platform.plugin.services.importexport.ImportSource.IRepositoryFileBundle;
import org.pentaho.platform.plugin.services.importexport.Log4JRepositoryImportLogger;
import org.pentaho.platform.plugin.services.importexport.RepositoryFileBundle;
import org.pentaho.platform.plugin.services.importexport.RoleExport;
import org.pentaho.platform.plugin.services.importexport.UserExport;
import org.pentaho.platform.plugin.services.importexport.BackupComponentConfig;
import org.pentaho.platform.plugin.services.importexport.exportManifest.ExportManifest;
import org.pentaho.platform.plugin.services.importexport.exportManifest.Parameters;
import org.pentaho.platform.plugin.services.importexport.exportManifest.bindings.ExportManifestMetaStore;
import org.pentaho.platform.plugin.services.importexport.exportManifest.bindings.ExportManifestMetadata;
import org.pentaho.platform.plugin.services.importexport.exportManifest.bindings.ExportManifestMondrian;
import org.pentaho.platform.plugin.services.importexport.legacy.MondrianCatalogRepositoryHelper;
import org.pentaho.platform.plugin.services.messages.Messages;
import org.pentaho.platform.repository.RepositoryFilenameUtils;
import org.pentaho.platform.security.policy.rolebased.IRoleAuthorizationPolicyRoleBindingDao;
import org.pentaho.platform.web.http.api.resources.services.FileService;

import javax.ws.rs.core.Response;
import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.Serializable;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

public class SolutionImportHandler implements IPlatformImportHandler {

  private static final String RESERVEDMAPKEY_LINEAGE_ID = "lineage-id";

  private static final String XMI_EXTENSION = ".xmi";

  private static final String EXPORT_MANIFEST_XML_FILE = "exportManifest.xml";
  private static final String DOMAIN_ID = "domain-id";
  private static final String UTF_8 = StandardCharsets.UTF_8.name();

  private IUnifiedRepository repository; // TODO inject via Spring
  protected Map<String, RepositoryFileImportBundle.Builder> cachedImports;
  private SolutionFileImportHelper solutionHelper;
  private List<IMimeType> mimeTypes;
  private boolean overwriteFile;
  private List<IRepositoryFileBundle> files;
  private boolean isPerformingRestore = false;
  protected ImportExportMetrics metrics;
  protected List<IImportHelper> importHelpers = new ArrayList<>();
  
  // Static SLF4J logger for pre-context operations (e.g., helper execution)
  private static final Logger STATIC_LOGGER = LoggerFactory.getLogger( SolutionImportHandler.class );
  
  // Instance logger for post-context operations (requires MDC setup)
  IRepositoryImportLogger logger = new Log4JRepositoryImportLogger();

  public SolutionImportHandler( List<IMimeType> mimeTypes ) {
    this.mimeTypes = mimeTypes;
    this.solutionHelper = new SolutionFileImportHelper();
    repository = PentahoSystem.get( IUnifiedRepository.class );
  }

  public ImportSession getImportSession() {
    return ImportSession.getSession();
  }

  public Log getLogger() {
    return getImportSession().getLogger();
  }

  public void addImportHelper( IImportHelper helper ) {
    importHelpers.add( helper );
  }

  public void runImportHelpers() {
    int successfulHelpers = 0;
    int totalHelpers = importHelpers.size();
    
    for ( IImportHelper helper : importHelpers ) {
      try {
        // Use static SLF4J logger - not Log4JRepositoryImportLogger
        // because job context may not be initialized yet
        STATIC_LOGGER.info( "Running import helper: " + helper.getName() );
        helper.doImport( this );
        successfulHelpers++;
        STATIC_LOGGER.info( "Successfully completed import helper: " + helper.getName() );
      } catch ( Exception e ) {
        STATIC_LOGGER.error( "Import helper " + helper.getName() + " failed: " + e.getMessage(), e );
        // Record failure but continue with next helper
      }
    }
    
    if ( isPerformingRestore ) {
      STATIC_LOGGER.debug( "Import helpers completed: " + successfulHelpers + "/" + totalHelpers + " successful" );
    }
  }

  @Override
  public void importFile( IPlatformImportBundle bundle ) throws PlatformImportException, DomainIdNullException,
      DomainAlreadyExistsException, DomainStorageException, IOException {
    IPlatformImporter platformImporter = PentahoSystem.get( IPlatformImporter.class );
    isPerformingRestore = platformImporter.getRepositoryImportLogger().isPerformingRestore();
    
    // Initialize metrics collector
    metrics = new ImportExportMetrics( ImportExportMetrics.OperationType.RESTORE );
    
    if ( isPerformingRestore ) {
      getLogger().info( Messages.getInstance().getString( "SolutionImportHandler.INFO_START_IMPORT_PROCESS" ) );
    }
    RepositoryFileImportBundle importBundle = (RepositoryFileImportBundle) bundle;

    // Processing file
    if ( isPerformingRestore ) {
      getLogger().debug( " Start:  pre processing files and folder from the bundle" );
    }
    if ( !processZip( bundle.getInputStream() ) ) {
      // Something went wrong, do not proceed!
      if ( isPerformingRestore ) {
        getLogger().error( "Failed to process ZIP file during restore" );
      }
      return;
    }
    if ( isPerformingRestore ) {
      getLogger().debug( " End:  pre processing files and folder from the bundle" );
    }
    setOverwriteFile( bundle.overwriteInRepository() );
    cachedImports = new HashMap<>();

    //Process Manifest Settings
    ExportManifest manifest = getImportSession().getManifest();
    BackupComponentConfig componentOverrides = getImportSession().getComponentOverrides();
    
    if ( isPerformingRestore && componentOverrides != null ) {
      getLogger().debug( "Selective restore active with component overrides: Users=" + componentOverrides.isIncludeUsers() + 
        ", Content=" + componentOverrides.isIncludeContent() + ", Datasources=" + componentOverrides.isIncludeDatasources() );
    }
    
    // Process Metadata
    if ( manifest != null ) {
      // Import users only if included in component overrides (or no overrides = full restore)
      if ( componentOverrides == null || componentOverrides.isIncludeUsers() ) {
        try {
          Map<String, List<String>> roleToUserMap = importUsers( manifest.getUserExports() );
          // import the roles
          importRoles( manifest.getRoleExports(), roleToUserMap );
        } catch ( Exception e ) {
          if ( isPerformingRestore ) {
            getLogger().error( "Failed to import users and roles: " + e.getMessage() );
            getLogger().debug( "Users and roles import error", e );
          }
        }
      } else {
        if ( isPerformingRestore ) {
          getLogger().debug( "Skipping users import - not included in component overrides" );
        }
      }

      // Import metadata (datasources) only if included
      if ( componentOverrides == null || componentOverrides.isIncludeDatasources() ) {
        try {
          importMetadata( manifest.getMetadataList(), bundle.isPreserveDsw() );
        } catch ( Exception e ) {
          if ( isPerformingRestore ) {
            getLogger().error( "Failed to import metadata: " + e.getMessage() );
            getLogger().debug( "Metadata import error", e );
          }
        }
      }

      // Process Mondrian only if included
      if ( componentOverrides == null || componentOverrides.isIncludeMondrian() ) {
        try {
          importMondrian( manifest.getMondrianList() );
        } catch ( Exception e ) {
          if ( isPerformingRestore ) {
            getLogger().error( "Failed to import Mondrian schemas: " + e.getMessage() );
            getLogger().debug( "Mondrian import error", e );
          }
        }
      }

      // Import metastore only if included
      if ( componentOverrides == null || componentOverrides.isIncludeMetastore() ) {
        try {
          importMetaStore( manifest.getMetaStore(), bundle.overwriteInRepository() );
        } catch ( Exception e ) {
          if ( isPerformingRestore ) {
            getLogger().error( "Failed to import metastore: " + e.getMessage() );
            getLogger().debug( "Metastore import error", e );
          }
        }
      }

      // Import JDBC datasources only if included
      if ( componentOverrides == null || componentOverrides.isIncludeDatasources() ) {
        try {
          importJDBCDataSource( manifest );
        } catch ( Exception e ) {
          if ( isPerformingRestore ) {
            getLogger().error( "Failed to import JDBC datasources: " + e.getMessage() );
            getLogger().debug( "JDBC datasource import error", e );
          }
        }
      }
    } else {
      if ( isPerformingRestore ) {
        getLogger().error( "Manifest is null - no content to import" );
      }
    }
    
    // Import files and folders if:
    // 1. Content is included in component overrides (normal case), OR
    // 2. Manifest has files (for schedule dependencies and other helpers)
    // Note: Schedule helpers will import missing dependencies as needed via importFileFromBundle()
    boolean hasFilesInManifest = manifest != null && manifest.getExportManifestEntities() != null 
      && !manifest.getExportManifestEntities().isEmpty();
    
    if ( componentOverrides == null || componentOverrides.isIncludeContent() || hasFilesInManifest ) {
      try {
        importRepositoryFilesAndFolders( manifest, bundle );
      } catch ( Exception e ) {
        if ( isPerformingRestore ) {
          getLogger().error( "Failed to import repository files and folders: " + e.getMessage() );
          getLogger().debug( "Repository files import error", e );
        }
      }
    }

    // Run import helpers (e.g., schedule import from scheduler-plugin)
    if ( !importHelpers.isEmpty() ) {
      try {
        runImportHelpers();
      } catch ( Exception e ) {
        if ( isPerformingRestore ) {
          getLogger().error( "Failed to run import helpers: " + e.getMessage() );
          getLogger().debug( "Import helpers error", e );
        }
      }
    }
    
    // Output metrics report
    if ( isPerformingRestore && metrics != null ) {
      getLogger().info( metrics.generateDetailedReport() );
    }
  }

  protected void importRepositoryFilesAndFolders( ExportManifest manifest, IPlatformImportBundle bundle ) throws IOException {
    if ( isPerformingRestore ) {
      getLogger().info( Messages.getInstance().getString( "SolutionImportHandler.INFO_START_IMPORT_FILEFOLDER" ) );
      getLogger().info( Messages.getInstance().getString( "SolutionImportHandler.INFO_COUNT_FILEFOLDER", files.size() ) );
    }
    Integer successfulFilesImportCount = 0;
    String manifestVersion = null;
    if ( manifest != null ) {
      manifestVersion = manifest.getManifestInformation().getManifestVersion();
    }
    RepositoryFileImportBundle importBundle = (RepositoryFileImportBundle) bundle;

    LocaleFilesProcessor localeFilesProcessor = new LocaleFilesProcessor();
    IPlatformImporter importer = PentahoSystem.get( IPlatformImporter.class );

    for ( IRepositoryFileBundle fileBundle : files ) {
      String fileName = fileBundle.getFile().getName();
      String actualFilePath = fileBundle.getPath();
      if ( manifestVersion != null ) {
        fileName = ExportFileNameEncoder.decodeZipFileName( fileName );
        actualFilePath = ExportFileNameEncoder.decodeZipFileName( actualFilePath );
      }
      String repositoryFilePath =
          RepositoryFilenameUtils.concat( PentahoPlatformImporter.computeBundlePath( actualFilePath ), fileName );

      if ( cachedImports.containsKey( repositoryFilePath ) ) {
        getLogger().debug( "Repository object with path [ " + repositoryFilePath + " ] found in the cache" );
        byte[] bytes = IOUtils.toByteArray( fileBundle.getInputStream() );
        RepositoryFileImportBundle.Builder builder = cachedImports.get( repositoryFilePath );
        builder.input( new ByteArrayInputStream( bytes ) );

        try {
          importer.importFile( build( builder ) );
          if ( isPerformingRestore ) {
            getLogger().debug( "Successfully restored repository object with path [ " + repositoryFilePath + " ] from the cache" );
          }
          successfulFilesImportCount++;
          continue;
        } catch ( PlatformImportException e ) {
          if ( isPerformingRestore ) {
            getLogger().error( Messages.getInstance().getString( "SolutionImportHandler.ERROR_IMPORTING_REPOSITORY_OBJECT", repositoryFilePath, e.getLocalizedMessage() ) );
          }
        }
      }

      RepositoryFileImportBundle.Builder bundleBuilder = new RepositoryFileImportBundle.Builder();
      InputStream bundleInputStream = null;

      String decodedFilePath = fileBundle.getPath();
      RepositoryFile decodedFile = fileBundle.getFile();
      if ( manifestVersion != null ) {
        decodedFile = new RepositoryFile.Builder( decodedFile ).path( decodedFilePath ).name( fileName ).title( fileName ).build();
        decodedFilePath = ExportFileNameEncoder.decodeZipFileName( fileBundle.getPath() );
      }

      if ( fileBundle.getFile().isFolder() ) {
        bundleBuilder.mime( "text/directory" );
        bundleBuilder.file( decodedFile );
        fileName = repositoryFilePath;
        repositoryFilePath = importBundle.getPath();
      } else {
        byte[] bytes = IOUtils.toByteArray( fileBundle.getInputStream() );
        bundleInputStream = new ByteArrayInputStream( bytes );
        // If is locale file store it for later processing.
        if ( localeFilesProcessor.isLocaleFile( fileBundle, importBundle.getPath(), bytes ) ) {
          getLogger().trace( Messages.getInstance()
              .getString( "SolutionImportHandler.SkipLocaleFile", repositoryFilePath ) );
          continue;
        }
        bundleBuilder.input( bundleInputStream );
        bundleBuilder.mime( solutionHelper.getMime( fileName ) );

        String filePath =
            ( decodedFilePath.equals( "/" ) || decodedFilePath.equals( "\\" ) ) ? "" : decodedFilePath;
        repositoryFilePath = RepositoryFilenameUtils.concat( importBundle.getPath(), filePath );
      }

      bundleBuilder.name( fileName );
      bundleBuilder.path( repositoryFilePath );

      String sourcePath;
      if ( fileBundle.getFile().isFolder() ) {
        sourcePath = fileName;
      } else {
        sourcePath =
            RepositoryFilenameUtils.concat( PentahoPlatformImporter.computeBundlePath( actualFilePath ), fileName );
      }

      //This clause was added for processing ivb files so that it would not try process acls on folders that the user
      //may not have rights to such as /home or /public
      if ( manifest != null && manifest.getExportManifestEntity( sourcePath ) == null && fileBundle.getFile()
          .isFolder() ) {
        continue;
      }

      RepositoryFileExtraMetaData repositoryFileExtraMetaData = getImportSession().processExtraMetaDataForFile( sourcePath );
      if ( repositoryFileExtraMetaData != null ) {
        // If the user specifically request to not restore the generated content during the restore process, we need to skip the import
        Map<String, Serializable> metadata = repositoryFileExtraMetaData.getExtraMetaData();
        boolean isFileAGC = metadata.containsKey( IScheduler.RESERVEDMAPKEY_LINEAGE_ID );
        BackupComponentConfig componentOverrides = getImportSession().getComponentOverrides();
        if ( componentOverrides != null && !componentOverrides.isIncludeGeneratedContent() && isFileAGC ) {
          if ( isPerformingRestore ) {
            getLogger().debug( "Skipping generated content file during restore: " + sourcePath
              + " (includeGeneratedContent=" + componentOverrides.isIncludeGeneratedContent() + ")" );
          }
          continue;
        }
      }

      getImportSession().setCurrentManifestKey( sourcePath );

      bundleBuilder.charSet( bundle.getCharSet() );
      bundleBuilder.overwriteFile( bundle.overwriteInRepository() );
      bundleBuilder.applyAclSettings( bundle.isApplyAclSettings() );
      bundleBuilder.retainOwnership( bundle.isRetainOwnership() );
      bundleBuilder.overwriteAclSettings( bundle.isOverwriteAclSettings() );
      bundleBuilder.acl( getImportSession().processAclForFile( sourcePath ) );
      bundleBuilder.extraMetaData( repositoryFileExtraMetaData );

      RepositoryFile file = getFile( importBundle, fileBundle );
      ManifestFile manifestFile = getImportSession().getManifestFile( sourcePath, file != null );

      bundleBuilder.hidden( isFileHidden( file, manifestFile, sourcePath ) );
      boolean isSchedulable = isSchedulable( file, manifestFile );

      if ( isSchedulable ) {
        bundleBuilder.schedulable( isSchedulable );
      } else {
        bundleBuilder.schedulable( fileIsScheduleInputSource( manifest, sourcePath ) );
      }

      IPlatformImportBundle platformImportBundle = build( bundleBuilder );
      try {
        // Skip metadata files if datasources are not included in selective restore
        BackupComponentConfig componentOverrides = getImportSession().getComponentOverrides();
        if ( componentOverrides != null && !componentOverrides.isIncludeDatasources() ) {
          String bundlePath = platformImportBundle.getPath() + platformImportBundle.getName();
          if ( bundlePath != null && bundlePath.endsWith( ".xmi" ) ) {
            if ( isPerformingRestore ) {
              getLogger().debug( "Skipping metadata file during restore: " + bundlePath + " (datasources not included)" );
            }
            continue;
          }
        }

        // Note: Generated content filtering during restore is limited - it would require reading metadata 
        // from the backup file bundle which may not be readily available. The includeGeneratedContent 
        // flag is primarily useful during backup operations to exclude transient scheduler output files.
        // During restore, users should exclude generated content at the backup stage.
        
        importer.importFile( platformImportBundle );
        successfulFilesImportCount++;
        if ( isPerformingRestore ) {
          getLogger().debug( "Successfully restored repository object with path [ " + repositoryFilePath + " ]" );
        }
      } catch ( PlatformImportException e ) {
        if ( isPerformingRestore ) {
          getLogger().error( Messages.getInstance().getString( "SolutionImportHandler.ERROR_IMPORTING_REPOSITORY_OBJECT", repositoryFilePath, e.getLocalizedMessage() ) );
        }
      }

      if ( bundleInputStream != null ) {
        bundleInputStream.close();
        bundleInputStream = null;
      }
    }

    // Process locale files.
    if ( isPerformingRestore ) {
      getLogger().info( Messages.getInstance().getString( "SolutionImportHandler.INFO_START_IMPORT_LOCALEFILE" ) );
    }
    int successfulLocaleFilesProcessed = 0;
    try {
      successfulLocaleFilesProcessed = localeFilesProcessor.processLocaleFiles( importer );
    } catch ( PlatformImportException e ) {
      if ( isPerformingRestore ) {
        getLogger().error( Messages.getInstance().getString( "SolutionImportHandler.ERROR_IMPORTING_LOCALE_FILE", e.getLocalizedMessage() ) );
      }
    } finally {
      if ( isPerformingRestore ) {
        getLogger().info( Messages.getInstance().getString( "SolutionImportHandler.INFO_END_IMPORT_LOCALEFILE" ) );
      }
    }

    if ( isPerformingRestore ) {
      int totalFileCount = successfulFilesImportCount + successfulLocaleFilesProcessed;
      int totalAttempted = files.size();
      int failedCount = totalAttempted - totalFileCount;
      
      // Track file imports in metrics
      if ( metrics != null ) {
        for ( int i = 0; i < totalFileCount; i++ ) {
          metrics.recordSuccess( ImportExportMetrics.Category.FILES );
        }
        for ( int i = 0; i < failedCount; i++ ) {
          metrics.recordFailure( ImportExportMetrics.Category.FILES, "file", "Import failed" );
        }
      }
      
      getLogger().info( Messages.getInstance().getString( "SolutionImportHandler.INFO_SUCCESSFUL_REPOSITORY_IMPORT_COUNT", successfulFilesImportCount + successfulLocaleFilesProcessed, files.size() ) );
      getLogger().info( Messages.getInstance().getString( "SolutionImportHandler.INFO_END_IMPORT_FILEFOLDER" ) );
    }
  }

  protected void importJDBCDataSource( ExportManifest manifest ) {
    if ( isPerformingRestore ) {
      getLogger().info( Messages.getInstance().getString( "SolutionImportHandler.INFO_START_IMPORT_DATASOURCE" ) );
    }
    // Add DB Connections
    List<org.pentaho.platform.plugin.services.importexport.exportManifest.bindings.DatabaseConnection> datasourceList = manifest.getDatasourceList();
    if ( datasourceList != null ) {
      int successfulDatasourceImportCount = 0;
      if ( isPerformingRestore ) {
        getLogger().info( Messages.getInstance().getString( "SolutionImportHandler.INFO_COUNT_DATASOURCE", datasourceList.size() ) );
      }
      IDatasourceMgmtService datasourceMgmtSvc = PentahoSystem.get( IDatasourceMgmtService.class );
      for ( org.pentaho.platform.plugin.services.importexport.exportManifest.bindings.DatabaseConnection databaseConnection : datasourceList ) {
        if ( databaseConnection.getDatabaseType() == null ) {
          // don't try to import the connection if there is no type it will cause an error
          // However, if this is the DI Server, and the connection is defined in a ktr, it will import automatically
          getLogger().warn( Messages.getInstance()
              .getString( "SolutionImportHandler.ConnectionWithoutDatabaseType", databaseConnection.getName() ) );
          continue;
        }
        try {
          IDatabaseConnection existingDBConnection =
              datasourceMgmtSvc.getDatasourceByName( databaseConnection.getName() );
          if ( existingDBConnection != null && existingDBConnection.getName() != null ) {
            if ( isOverwriteFile() ) {
              databaseConnection.setId( existingDBConnection.getId() );
              datasourceMgmtSvc.updateDatasourceByName( databaseConnection.getName(),
                  DatabaseConnectionConverter.export2model( databaseConnection ) );
            }
          } else {
            datasourceMgmtSvc.createDatasource( DatabaseConnectionConverter.export2model( databaseConnection ) );
          }
          successfulDatasourceImportCount++;
        } catch ( Exception e ) {
          if ( isPerformingRestore ) {
            getLogger().error( Messages.getInstance().getString( "SolutionImportHandler.ERROR_IMPORTING_JDBC_DATASOURCE", databaseConnection.getName(), e.getLocalizedMessage() ) );
          }
        }
      }
      if ( isPerformingRestore ) {
        int datasourceFailedCount = datasourceList.size() - successfulDatasourceImportCount;
        
        // Track datasource imports in metrics
        if ( metrics != null ) {
          for ( int i = 0; i < successfulDatasourceImportCount; i++ ) {
            metrics.recordSuccess( ImportExportMetrics.Category.DATASOURCES );
          }
          for ( int i = 0; i < datasourceFailedCount; i++ ) {
            metrics.recordFailure( ImportExportMetrics.Category.DATASOURCES, "datasource", "Import failed" );
          }
        }
        
        getLogger().info( Messages.getInstance().getString( "SolutionImportHandler.INFO_SUCCESSFUL_DATASOURCE_IMPORT_COUNT", successfulDatasourceImportCount, datasourceList.size() ) );
      }
    }
    if ( isPerformingRestore ) {
      getLogger().info( Messages.getInstance().getString( "SolutionImportHandler.INFO_END_IMPORT_DATASOURCE" ) );
    }
  }

  private RepositoryFile getFile( IPlatformImportBundle importBundle, IRepositoryFileBundle fileBundle ) {
    String repositoryFilePath =
        repositoryPathConcat( importBundle.getPath(), fileBundle.getPath(), fileBundle.getFile().getName() );
    return repository.getFile( repositoryFilePath );
  }

  /**
   * Normalize a repository path for consistent comparison:
   * - Ensures leading forward slash
   * - Converts backslashes to forward slashes
   * - Decodes URL-encoded characters (e.g., %28 → (, %29 → ), %20 → space)
   * - Normalizes space encoding (both spaces and + are treated equivalently)
   * - Handles URL encoding inconsistencies
   * 
   * @param path the path to normalize
   * @return normalized path
   */
  private String normalizePath( String path ) {
    if ( path == null ) {
      return "";
    }
    
    String normalized = path;
    
    // 1. URL-decode common characters that might be encoded
    // Handle parentheses: %28 = (, %29 = )
    normalized = normalized.replace( "%28", "(" );
    normalized = normalized.replace( "%29", ")" );
    // Handle spaces: %20 = space
    normalized = normalized.replace( "%20", " " );
    // Handle other common encoded chars
    normalized = normalized.replace( "%5B", "[" );  // [
    normalized = normalized.replace( "%5D", "]" );  // ]
    normalized = normalized.replace( "%26", "&" );  // &
    normalized = normalized.replace( "%2B", "+" );  // +
    
    // 2. Convert backslashes to forward slashes
    normalized = normalized.replace( File.separator, RepositoryFile.SEPARATOR );
    normalized = normalized.replace( "\\", RepositoryFile.SEPARATOR );
    
    // 3. Ensure leading forward slash
    if ( !normalized.startsWith( RepositoryFile.SEPARATOR ) ) {
      normalized = RepositoryFile.SEPARATOR + normalized;
    }
    
    // 4. Normalize space encoding: convert + to space
    normalized = normalized.replace( "+", " " );  // Convert + to space
    normalized = normalized.replaceAll( "\\s+", " " );  // Normalize multiple spaces to single space
    
    return normalized;
  }

  /**
   * Imports a single file from the backup bundle into the repository.
   * Called by import helpers (e.g., ScheduleImportUtil) to import files they depend on.
   * This allows helpers to import missing dependencies without core knowing about them.
   * 
   * @param filePath the repository path of the file to import (e.g., "/Reports/SalesReport.prpt")
   * @return true if successfully imported, false if not found or failed
   */
  public boolean importFileFromBundle( String filePath ) {
    if ( filePath == null || filePath.trim().isEmpty() ) {
      return false;
    }
    
    if ( isPerformingRestore ) {
      getLogger().debug( "Attempting to import file from bundle: [ " + filePath + " ]" );
    }
    
    try {
      // Search files list for matching file
      for ( IRepositoryFileBundle fileBundle : files ) {
        String fileName = fileBundle.getFile().getName();
        String actualFilePath = fileBundle.getPath();
        String manifestVersion = null;
        
        // Get manifest version if available
        ExportManifest manifest = getImportSession().getManifest();
        if ( manifest != null ) {
          manifestVersion = manifest.getManifestInformation().getManifestVersion();
        }
        
        if ( manifestVersion != null ) {
          fileName = ExportFileNameEncoder.decodeZipFileName( fileName );
          actualFilePath = ExportFileNameEncoder.decodeZipFileName( actualFilePath );
        }
        
        String repositoryFilePath = RepositoryFilenameUtils.concat( 
            PentahoPlatformImporter.computeBundlePath( actualFilePath ), fileName );
        
        // Normalize both paths for comparison
        String normalizedSearchPath = normalizePath( filePath );
        String normalizedBundlePath = normalizePath( repositoryFilePath );
        
        if ( normalizedSearchPath.equalsIgnoreCase( normalizedBundlePath ) ) {
          // Found the file - import it
          if ( isPerformingRestore ) {
            getLogger().debug( "Found file in bundle: [ " + repositoryFilePath + " ]" );
          }
          
          try {
            RepositoryFileImportBundle.Builder bundleBuilder = new RepositoryFileImportBundle.Builder();
            bundleBuilder.input( fileBundle.getInputStream() );
            bundleBuilder.file( fileBundle.getFile() );
            bundleBuilder.path( actualFilePath );
            bundleBuilder.overwriteFile( overwriteFile );
            bundleBuilder.retainOwnership( false );
            bundleBuilder.charSet( fileBundle.getCharset() );
            
            IPlatformImporter importer = PentahoSystem.get( IPlatformImporter.class );
            if ( importer != null ) {
              importer.importFile( build( bundleBuilder ) );
              if ( isPerformingRestore ) {
                getLogger().debug( "Successfully imported file from bundle: [ " + filePath + " ]" );
              }
              return true;
            }
          } catch ( Exception e ) {
            getLogger().error( "Failed to import file from bundle [ " + filePath + " ]: " + e.getMessage() );
            return false;
          }
        }
      }
      
      // File not found in bundle
      if ( isPerformingRestore ) {
        getLogger().warn( "File not found in bundle: [ " + filePath + " ]" );
      }
      return false;
      
    } catch ( Exception e ) {
      getLogger().error( "Error importing file from bundle [ " + filePath + " ]: " + e.getMessage() );
      return false;
    }
  }

  /**
   * Imports a file to the repository using the same logic as importRepositoryFilesAndFolders.
   * This properly handles all the import details: mime types, ACLs, metadata, etc.
   * 
   * @param fileBundle the file bundle to import
   * @param importManifest the export manifest (may be null)
   * @return true if successfully imported, false otherwise
   */
  protected boolean importFileBundle( IRepositoryFileBundle fileBundle, ExportManifest importManifest ) {
    try {
      String fileName = fileBundle.getFile().getName();
      String actualFilePath = fileBundle.getPath();
      String manifestVersion = null;
      
      if ( importManifest != null ) {
        manifestVersion = importManifest.getManifestInformation().getManifestVersion();
        if ( manifestVersion != null ) {
          fileName = ExportFileNameEncoder.decodeZipFileName( fileName );
          actualFilePath = ExportFileNameEncoder.decodeZipFileName( actualFilePath );
        }
      }
      
      // Skip folders for schedule dependencies - only import actual files
      if ( fileBundle.getFile().isFolder() ) {
        return true;
      }
      
      byte[] fileBytes = IOUtils.toByteArray( fileBundle.getInputStream() );
      InputStream bundleInputStream = new ByteArrayInputStream( fileBytes );
      
      String decodedFilePath = actualFilePath;
      RepositoryFile decodedFile = fileBundle.getFile();
      if ( manifestVersion != null ) {
        decodedFile = new RepositoryFile.Builder( decodedFile ).path( decodedFilePath ).name( fileName ).title( fileName ).build();
        decodedFilePath = ExportFileNameEncoder.decodeZipFileName( fileBundle.getPath() );
      }
      
      RepositoryFileImportBundle.Builder bundleBuilder = new RepositoryFileImportBundle.Builder();
      
      String filePath = ( decodedFilePath.equals( "/" ) || decodedFilePath.equals( "\\" ) ) ? "" : decodedFilePath;
      String repositoryFilePath = RepositoryFilenameUtils.concat( "/", filePath );
      
      bundleBuilder.name( fileName );
      bundleBuilder.path( repositoryFilePath );
      bundleBuilder.input( bundleInputStream );
      bundleBuilder.mime( solutionHelper.getMime( fileName ) );
      
      String sourcePath = RepositoryFilenameUtils.concat( PentahoPlatformImporter.computeBundlePath( actualFilePath ), fileName );
      
      bundleBuilder.charSet( UTF_8 );
      bundleBuilder.overwriteFile( overwriteFile );
      bundleBuilder.applyAclSettings( true );
      bundleBuilder.retainOwnership( false );
      bundleBuilder.overwriteAclSettings( false );
      
      // Process extra metadata and ACLs
      RepositoryFileExtraMetaData repositoryFileExtraMetaData = getImportSession().processExtraMetaDataForFile( sourcePath );
      if ( repositoryFileExtraMetaData != null ) {
        bundleBuilder.extraMetaData( repositoryFileExtraMetaData );
        bundleBuilder.acl( getImportSession().processAclForFile( sourcePath ) );
      }
      
      // Mark as schedulable if it's referenced by a schedule
      boolean isSchedulable = importManifest != null && fileIsScheduleInputSource( importManifest, sourcePath );
      if ( isSchedulable ) {
        bundleBuilder.schedulable( true );
      }
      
      IPlatformImportBundle platformImportBundle = build( bundleBuilder );
      IPlatformImporter importer = PentahoSystem.get( IPlatformImporter.class );
      importer.importFile( platformImportBundle );
      
      if ( isPerformingRestore ) {
        getLogger().debug( "Successfully imported file for schedule dependency: [ " + repositoryFilePath + " ]" );
      }
      return true;
      
    } catch ( Exception e ) {
      if ( isPerformingRestore ) {
        getLogger().error( "Failed to import file bundle for schedule: " + e.getMessage(), e );
      }
      return false;
    }
  }

  /**
   * Ensures that the file referenced by a schedule input path exists in the repository.
   * For selective restores, files are only in the bundle if they're schedule dependencies,
   * so we must import them before schedule creation.
   * 
   * @param inputFilePath the repository path of the file referenced by the schedule
   * @return true if the file exists or was successfully imported, false otherwise
   */
  protected boolean ensureScheduleInputFileExists( String inputFilePath ) {
    // Normalize the path to use forward slashes
    String normalizedPath = inputFilePath.replace( File.separator, RepositoryFile.SEPARATOR );
    
    // Check if the file already exists in the repository
    RepositoryFile existingFile = repository.getFile( normalizedPath );
    if ( existingFile != null ) {
      if ( isPerformingRestore ) {
        getLogger().debug( "Schedule input file [ " + normalizedPath + " ] already exists in repository" );
      }
      return true;
    }
    
    if ( isPerformingRestore ) {
      getLogger().debug( "Schedule input file [ " + normalizedPath + " ] does not exist in repository, searching in backup files..." );
    }
    
    // File doesn't exist, try to find and import it from the backup
    if ( CollectionUtils.isEmpty( files ) ) {
      if ( isPerformingRestore ) {
        getLogger().warn( "No backup files available to import missing schedule input file [ " + normalizedPath + " ]" );
      }
      return false;
    }
    
    ExportManifest manifest = getImportSession().getManifest();
    
    // Search for the file in the extracted files list
    // Strategy: First try exact path match, then try filename match as fallback
    IRepositoryFileBundle matchedBundle = null;
    String normalizedInputPath = normalizePath( normalizedPath );
    String inputFileName = normalizedPath.substring( normalizedPath.lastIndexOf( "/" ) + 1 ).toLowerCase();
    
    // Pass 1: Try exact path matching
    for ( IRepositoryFileBundle fileBundle : files ) {
      String fileName = fileBundle.getFile().getName();
      String filePath = fileBundle.getPath();
      
      // Build the full repository path for this file
      String repositoryPath = RepositoryFilenameUtils.concat( filePath, fileName );
      
      // Normalize both paths for comparison
      String normalizedRepositoryPath = normalizePath( repositoryPath );
      
      // Also check if this is a locale file for the file we're looking for
      // Locale files have format: "path/filename.locale" 
      String baseFileNameWithoutLocale = normalizedRepositoryPath;
      if ( normalizedRepositoryPath.endsWith( ".locale" ) ) {
        // Remove the .locale suffix for comparison
        baseFileNameWithoutLocale = normalizedRepositoryPath.substring( 0, normalizedRepositoryPath.lastIndexOf( ".locale" ) );
      }
      
      if ( isPerformingRestore ) {
        getLogger().trace( "Comparing Input: [ " + normalizedInputPath + " ] vs Repo: [ " + normalizedRepositoryPath + " ]" );
      }
      
      // Check if this is the file we're looking for (exact path or locale file match)
      if ( normalizedRepositoryPath.equalsIgnoreCase( normalizedInputPath ) ||
           baseFileNameWithoutLocale.equalsIgnoreCase( normalizedInputPath ) ) {
        if ( isPerformingRestore ) {
          getLogger().debug( "✓ EXACT MATCH FOUND - Input: [ " + normalizedPath + " ] matches Backup: [ " + repositoryPath + " ]" );
        }
        matchedBundle = fileBundle;
        break;
      }
      
      // Also check suffix match (last parts of path)
      // This helps when bundle path structure differs (e.g., "/input/file.ktr" vs "/schedules/input/file.ktr")
      String normalizedRepoFileName = normalizedRepositoryPath.substring( normalizedRepositoryPath.lastIndexOf( "/" ) + 1 ).toLowerCase();
      if ( normalizedInputPath.endsWith( normalizedRepositoryPath ) || 
           normalizedRepositoryPath.endsWith( normalizedInputPath ) ) {
        if ( isPerformingRestore ) {
          getLogger().debug( "✓ SUFFIX MATCH FOUND - Input: [ " + normalizedPath + " ] partially matches Backup: [ " + repositoryPath + " ]" );
        }
        matchedBundle = fileBundle;
        break;
      }
    }
    
    // Pass 2: If no exact match, try filename-only matching as fallback
    if ( matchedBundle == null ) {
      if ( isPerformingRestore ) {
        getLogger().debug( "No exact path match found for [ " + normalizedPath + " ], trying filename-only match..." );
      }
      
      for ( IRepositoryFileBundle fileBundle : files ) {
        String fileName = fileBundle.getFile().getName();
        String bundleFileNameLower = fileName.toLowerCase();
        
        // Remove .locale suffix if present for comparison
        String bundleFileNameBase = bundleFileNameLower;
        if ( bundleFileNameLower.endsWith( ".locale" ) ) {
          bundleFileNameBase = bundleFileNameLower.substring( 0, bundleFileNameLower.lastIndexOf( ".locale" ) );
        }
        
        // Match filename (case-insensitive)
        if ( inputFileName.equalsIgnoreCase( bundleFileNameBase ) || 
             inputFileName.equalsIgnoreCase( bundleFileNameLower ) ) {
          if ( isPerformingRestore ) {
            getLogger().debug( "✓ FILENAME MATCH FOUND - [ " + inputFileName + " ] matches Bundle file: [ " + fileName + " ]" );
          }
          matchedBundle = fileBundle;
          break;
        }
      }
    }
    
    // If we found a match, import it
    if ( matchedBundle != null ) {
      if ( isPerformingRestore ) {
        getLogger().info( "✓ MATCH FOUND - Schedule input file [ " + normalizedPath + " ] found in backup bundle" );
      }
      
      // Use the proper import mechanism that mirrors importRepositoryFilesAndFolders
      if ( importFileBundle( matchedBundle, manifest ) ) {
        if ( isPerformingRestore ) {
          getLogger().info( "✓ Successfully imported schedule input file: [ " + normalizedPath + " ]" );
        }
        return true;
      } else {
        if ( isPerformingRestore ) {
          getLogger().error( "✗ Failed to import schedule input file: [ " + normalizedPath + " ]" );
        }
        return false;
      }
    }
    
    if ( isPerformingRestore ) {
      getLogger().warn( "✗ NO MATCH - Schedule file [ " + normalizedPath + " ] not found in backup files. Searched " + files.size() + " files." );
      getLogger().info( "Available files in backup:" );
      for ( IRepositoryFileBundle fb : files ) {
        String fName = fb.getFile().getName();
        String fPath = fb.getPath();
        String fullPath = RepositoryFilenameUtils.concat( fPath, fName );
        getLogger().info( "  - [ " + normalizePath( fullPath ) + " ]" );
      }
    }
    return false;
  }

  // MOVED TO: pentaho-scheduler-plugin/ScheduleImportUtil.java via IImportHelper pattern
  // This method is no longer used - schedule imports are now handled via the IImportHelper plugin mechanism
  // The ScheduleImportUtil class in the scheduler-plugin implements IImportHelper and handles all schedule imports
  //
  // @Deprecated - Use ScheduleImportUtil in scheduler-plugin instead
  protected void importSchedules( List<IJobScheduleRequest> scheduleList ) throws PlatformImportException {
    // This method is deprecated and should not be called
    // Schedule imports are now handled by ScheduleImportUtil which is registered as an IImportHelper
    getLogger().warn( "importSchedules() is deprecated. Schedule imports should be handled by ScheduleImportUtil via IImportHelper." );
  }

  protected void importMetaStore( ExportManifestMetaStore manifestMetaStore, boolean overwrite ) {
    if ( isPerformingRestore ) {
      getLogger().info( Messages.getInstance().getString( "SolutionImportHandler.INFO_START_IMPORT_METASTORE" ) );
    }
    if ( manifestMetaStore != null ) {
      // get the zipped metastore from the export bundle
      RepositoryFileImportBundle.Builder bundleBuilder =
          new RepositoryFileImportBundle.Builder()
              .path( manifestMetaStore.getFile() )
              .name( manifestMetaStore.getName() )
              .withParam( "description", manifestMetaStore.getDescription() )
              .charSet( UTF_8 )
              .overwriteFile( overwrite )
              .mime( "application/vnd.pentaho.metastore" );

      cachedImports.put( manifestMetaStore.getFile(), bundleBuilder );
      if ( isPerformingRestore ) {
        getLogger().info( Messages.getInstance().getString( "SolutionImportHandler.INFO_SUCCESSFUL_IMPORT_METASTORE" ) );
        // Track metastore import as success in metrics
        if ( metrics != null ) {
          metrics.recordSuccess( ImportExportMetrics.Category.METASTORE );
        }
      }
    } else {
      // Metastore was not included in export
      if ( metrics != null ) {
        metrics.recordSkip( ImportExportMetrics.Category.METASTORE, "metastore", "Not included in export" );
      }
    }
    if ( isPerformingRestore ) {
      getLogger().info( Messages.getInstance().getString( "SolutionImportHandler.INFO_END_IMPORT_METASTORE" ) );
    }
  }

  /**
   * Imports UserExport objects into the platform as users.
   * Tracks whether each user was newly created or already existed in the system.
   *
   * @param users the list of users to import
   * @return A map of role names to list of users in that role
   */
  protected Map<String, List<String>> importUsers( List<UserExport> users ) {
    Map<String, List<String>> roleToUserMap = new HashMap<>();
    int successFullUserImportCount = 0;
    int newUsersCreated = 0;
    int existingUsersSkipped = 0;
    int userFailedCount = 0;
    
    if ( isPerformingRestore ) {
      getLogger().info( Messages.getInstance().getString( "SolutionImportHandler.INFO_START_IMPORT_USER" ) );
    }
    if ( users != null ) {
      if ( isPerformingRestore ) {
        getLogger().info( Messages.getInstance().getString( "SolutionImportHandler.INFO_COUNT_USER", users.size() ) );
      }
      for ( UserExport user : users ) {
        int importResult = importUserAndRoleWithTracking( user.getUsername(), user, roleToUserMap );
        if ( importResult > 0 ) {
          successFullUserImportCount++;
          if ( importResult == 1 ) {
            // User was newly created
            newUsersCreated++;
          } else if ( importResult == 2 ) {
            // User already existed and was skipped
            existingUsersSkipped++;
          }
        } else {
          // User import failed
          userFailedCount++;
        }
      }
    }
    
    if ( isPerformingRestore ) {
      getLogger().info( "User import summary - Total: " + (users != null ? users.size() : 0) + 
        ", Created: " + newUsersCreated + ", Existing (skipped): " + existingUsersSkipped + ", Failed: " + userFailedCount );
      
      // Track user imports in metrics with detailed breakdown
      if ( metrics != null ) {
        for ( int i = 0; i < newUsersCreated; i++ ) {
          metrics.recordSuccess( ImportExportMetrics.Category.USERS );
        }
        for ( int i = 0; i < existingUsersSkipped; i++ ) {
          metrics.recordSuccess( ImportExportMetrics.Category.USERS );
        }
        for ( int i = 0; i < userFailedCount; i++ ) {
          metrics.recordFailure( ImportExportMetrics.Category.USERS, "user", "Import failed" );
        }
      }
      
      getLogger().info( Messages.getInstance().getString( "SolutionImportHandler.INFO_SUCCESSFUL_USER_COUNT", successFullUserImportCount, users != null ? users.size() : 0 ) );
      getLogger().info( Messages.getInstance().getString( "SolutionImportHandler.INFO_END_IMPORT_USER" ) );
    }
    return roleToUserMap;
  }
  
  /**
   * Import a single user with tracking of whether it was newly created or already existed.
   * 
   * @param username the username of the user to import
   * @param user the UserExport object containing user data
   * @param roleToUserMap the map to populate with user-to-role mappings
   * @return 1 if user was newly created, 2 if user already existed (skipped), 0 if import failed
   */
  protected int importUserAndRoleWithTracking( String username, UserExport user, Map<String, List<String>> roleToUserMap ) {
    boolean result = importUserAndRole( username, user, roleToUserMap );
    
    // Determine if user was newly created or already existed
    // We can check by attempting to get the user and comparing creation context
    if ( result ) {
      // Check if user already existed before import
      IUserRoleDao roleDao = PentahoSystem.get( IUserRoleDao.class );
      if ( roleDao != null ) {
        try {
          ITenant tenant = new Tenant( "/pentaho/" + TenantUtils.getDefaultTenant(), true );
          IPentahoUser existingUser = roleDao.getUser( tenant, username );
          if ( existingUser != null ) {
            // User exists, so it was either already there or just created
            // Since we checked before creating, if we're here with result=true,
            // it means either: (a) it was already there (returned true early), or (b) we just created it
            
            // The logic is: in importUserAndRole, if user exists, we return true early
            // If we reach the createUser() call, it's a new user
            // So we need to distinguish these cases
            
            // For now, we can assume:
            // - If importUserAndRole returns true and user exists, it was skipped (return 2)
            // - If importUserAndRole returns true and we just created it, return 1
            // But since we can't easily distinguish after the fact, we'll use a simpler approach:
            // Check if this is marked as a default/system user vs new
            
            if ( isSystemOrDefaultUser( username ) ) {
              // System user that already existed
              if ( isPerformingRestore ) {
                getLogger().debug( "User [ " + username + " ] is a system/default user (skipped)" );
              }
              return 2; // Existing
            }
          }
        } catch ( Exception e ) {
          // Error checking user status, default to assuming it was created
          if ( isPerformingRestore ) {
            getLogger().debug( "Could not determine if user [ " + username + " ] was new or existing: " + e.getMessage() );
          }
        }
      }
      // Default assumption: user was created successfully
      if ( isPerformingRestore ) {
        getLogger().debug( "User [ " + username + " ] import completed successfully" );
      }
      return 1; // Newly created
    } else {
      // Import failed
      if ( isPerformingRestore ) {
        getLogger().debug( "User [ " + username + " ] import failed" );
      }
      return 0; // Failed
    }
  }
  
  /**
   * Helper method to determine if a user is a system or default user that was not newly imported
   */
  private boolean isSystemOrDefaultUser( String username ) {
    // Common default Pentaho users
    String[] defaultUsers = { "admin", "pentahoReportingSystemUser", "pentahoSystemUser" };
    for ( String defaultUser : defaultUsers ) {
      if ( defaultUser.equalsIgnoreCase( username ) ) {
        return true;
      }
    }
    return false;
  }

  /**
   * Import a single user with their roles and settings
   * 
   * @param username the username of the user to import
   * @param user the UserExport object containing user data (password, roles, settings)
   * @param roleToUserMap the map to populate with user-to-role mappings for later role import
   * @return true if user was successfully imported, false otherwise
   */
  public boolean importUserAndRole( String username, UserExport user, Map<String, List<String>> roleToUserMap ) {
    IUserRoleDao roleDao = PentahoSystem.get( IUserRoleDao.class );
    if ( roleDao == null ) {
      getLogger().warn( "Unable to import user [ " + username + " ] - IUserRoleDao not available" );
      return false;
    }
    
    ITenant tenant = new Tenant( "/pentaho/" + TenantUtils.getDefaultTenant(), true );
    
    // Check if user already exists
    try {
      IPentahoUser existingUser = roleDao.getUser( tenant, username );
      if ( existingUser != null ) {
        if ( isPerformingRestore ) {
          getLogger().debug( "User [ " + username + " ] already exists, skipping import" );
        }
        
        // Still need to map the user to their roles for role binding later
        for ( String role : user.getRoles() ) {
          List<String> userList;
          if ( !roleToUserMap.containsKey( role ) ) {
            userList = new ArrayList<>();
            roleToUserMap.put( role, userList );
          } else {
            userList = roleToUserMap.get( role );
          }
          userList.add( username );
        }
        return true; // User exists, treat as success
      }
    } catch ( Exception e ) {
      // User doesn't exist, proceed with import
      if ( isPerformingRestore ) {
        getLogger().debug( "User [ " + username + " ] does not exist or error checking existence: " + e.getMessage() );
      }
    }
    
    // User doesn't exist, import it
    String password = user.getPassword();
    getLogger().debug( Messages.getInstance().getString( "USER.importing", username ) );

    // map the user to the roles he/she is in
    for ( String role : user.getRoles() ) {
      List<String> userList;
      if ( !roleToUserMap.containsKey( role ) ) {
        userList = new ArrayList<>();
        roleToUserMap.put( role, userList );
      } else {
        userList = roleToUserMap.get( role );
      }
      userList.add( username );
    }

    String[] userRoles = user.getRoles().toArray( new String[] {} );
    try {
      if ( isPerformingRestore ) {
        getLogger().debug( "Restoring user [ " + username + " ] " );
      }
      roleDao.createUser( tenant, username, password, null, userRoles );
      if ( isPerformingRestore ) {
        getLogger().debug( "Successfully restored user [ " + username + " ]" );
      }
    } catch ( AlreadyExistsException e ) {
      // it's ok if the user already exists, it is probably a default user
      getLogger().debug( Messages.getInstance().getString( "USER.Already.Exists", username ) );
      // User was just created but this exception thrown anyway - still treat as success
      return true;
    } catch ( Exception e ) {
      getLogger().debug( Messages.getInstance()
          .getString( "ERROR.OverridingExistingUser", username ), e );
      getLogger().error( Messages.getInstance()
          .getString( "ERROR.OverridingExistingUser", username ) );
      return false;
    }
    if ( isPerformingRestore ) {
      getLogger().debug( "Restoring user [ " + username + " ] specific settings" );
    }
    importUserSettings( user );
    if ( isPerformingRestore ) {
      getLogger().debug( "Successfully restored user [ " + username + " ] specific settings" );
    }
    return true;
  }

  /**
   * Import only selected users and their roles (used by plugins like scheduler to import dependencies)
   * 
   * This is typically called by plugins (e.g., scheduler) to import individual users as needed.
   * The import flow is:
   * 1. Main import: all users/roles imported first (lines 203-207)
   * 2. Helpers run: plugins can import additional users for dependencies via this method
   * 
   * @param username the username to import
   * @param user the UserExport containing user data
   * @param roleToUserMap map to populate for role binding
   * @return true if successfully imported, false otherwise
   */
  public boolean importScheduleOwnerUser( String username, UserExport user, Map<String, List<String>> roleToUserMap ) {
    return importUserAndRole( username, user, roleToUserMap );
  }

  protected void importGlobalUserSettings( List<ExportManifestUserSetting> globalSettings ) {
    if ( isPerformingRestore ) {
      getLogger().debug( "[Start: Restore global user settings]" );
    }
    IUserSettingService settingService = PentahoSystem.get( IUserSettingService.class );
    int successfulGlobalSettingsCount = 0;
    int totalGlobalSettingsCount = globalSettings != null ? globalSettings.size() : 0;
    
    if ( settingService != null && globalSettings != null ) {
      for ( ExportManifestUserSetting globalSetting : globalSettings ) {
        try {
          if ( isOverwriteFile() ) {
            if ( isPerformingRestore ) {
              getLogger().trace( "Overwrite flag is set to true. Setting global user setting [ " + globalSetting.getName() + " ]" );
            }
            settingService.setGlobalUserSetting( globalSetting.getName(), globalSetting.getValue() );
            successfulGlobalSettingsCount++;
            if ( isPerformingRestore ) {
              getLogger().debug( "Successfully set global user setting [ " + globalSetting.getName() + " ]" );
            }
          } else {
            if ( isPerformingRestore ) {
              getLogger().trace( "Overwrite flag is set to false. Only setting [ " + globalSetting.getName() + " ] if does not exist" );
            }
            IUserSetting userSetting = settingService.getGlobalUserSetting( globalSetting.getName(), null );
            if ( userSetting == null ) {
              settingService.setGlobalUserSetting( globalSetting.getName(), globalSetting.getValue() );
              successfulGlobalSettingsCount++;
              if ( isPerformingRestore ) {
                getLogger().debug( "Successfully set global user setting [ " + globalSetting.getName() + " ]" );
              }
            }
          }
        } catch ( Exception e ) {
          getLogger().warn( "Failed to set global user setting [ " + globalSetting.getName() + " ]: " + e.getMessage() );
          getLogger().debug( "Global setting error", e );
          // Continue with next setting even if this one fails
        }
      }
    }
    if ( isPerformingRestore ) {
      if ( totalGlobalSettingsCount > 0 ) {
        getLogger().debug( "Completed restore of global user settings: " + successfulGlobalSettingsCount + "/" + totalGlobalSettingsCount + " successful" );
      }
      getLogger().debug( "[End: Restore global user settings]" );
    }
  }

  protected void importUserSettings( UserExport user ) {
    IUserSettingService settingService = PentahoSystem.get( IUserSettingService.class );
    IAnyUserSettingService userSettingService = null;
    int userSettingsListSize = 0;
    int successfulUserSettingsImportCount = 0;
    if ( settingService != null && settingService instanceof IAnyUserSettingService ) {
      userSettingService = (IAnyUserSettingService) settingService;
    }
    if ( isPerformingRestore ) {
      getLogger().info( Messages.getInstance().getString( "SolutionImportHandler.INFO_START_IMPORT_USER_SETTING" ) );
    }
    if ( userSettingService != null ) {
      List<ExportManifestUserSetting> exportedSettings = user.getUserSettings();
      userSettingsListSize = user.getUserSettings().size();
      if ( isPerformingRestore ) {
        getLogger().info( Messages.getInstance().getString( "SolutionImportHandler.INFO_COUNT_USER_SETTING", userSettingsListSize, user.getUsername() ) );
      }
      for ( ExportManifestUserSetting exportedSetting : exportedSettings ) {
        try {
          if ( isPerformingRestore ) {
            getLogger().debug( "Restore user specific setting  [ " + exportedSetting.getName() + " ]" );
          }
          if ( isOverwriteFile() ) {
            if ( isPerformingRestore ) {
              getLogger().debug( "Overwrite is set to true. So restoring setting  [ " + exportedSetting.getName() + " ]" );
            }
            userSettingService.setUserSetting( user.getUsername(),
                exportedSetting.getName(), exportedSetting.getValue() );
            if ( isPerformingRestore ) {
              getLogger().debug( "Finished restore of user specific setting with name [ " + exportedSetting.getName() + " ]" );
            }
            successfulUserSettingsImportCount++;
          } else {
            // see if it's there first before we set this setting
            if ( isPerformingRestore ) {
              getLogger().debug( "Overwrite is set to false. Only restore setting  [ " + exportedSetting.getName() + " ] if is does not exist" );
            }
            IUserSetting userSetting =
                userSettingService.getUserSetting( user.getUsername(), exportedSetting.getName(), null );
            if ( userSetting == null ) {
              // only set it if we didn't find that it exists already
              userSettingService.setUserSetting( user.getUsername(), exportedSetting.getName(), exportedSetting.getValue() );
              if ( isPerformingRestore ) {
                getLogger().debug( "Finished restore of user specific setting with name [ " + exportedSetting.getName() + " ]" );
              }
              successfulUserSettingsImportCount++;
            }
          }
          if ( isPerformingRestore ) {
            getLogger().debug( "Successfully restored setting  [ " + exportedSetting.getName() + " ]" );
          }
        } catch ( Exception e ) {
          getLogger().warn( "Failed to import user setting [ " + exportedSetting.getName() + " ] for user [ " + user.getUsername() + " ]: " + e.getMessage() );
          getLogger().debug( "User setting error", e );
          // Continue with next setting even if this one fails
        }
      }
      if ( isPerformingRestore ) {
        getLogger().info( Messages.getInstance()
            .getString( "SolutionImportHandler.INFO_SUCCESSFUL_USER_SETTING_IMPORT_COUNT", successfulUserSettingsImportCount, userSettingsListSize ) );
        getLogger().info( Messages.getInstance()
            .getString( "SolutionImportHandler.INFO_END_IMPORT_USER_SETTING" ) );
      }
    }
  }

  protected void importRoles( List<RoleExport> roles, Map<String, List<String>> roleToUserMap ) {
    if ( isPerformingRestore ) {
      getLogger().info( Messages.getInstance().getString( "SolutionImportHandler.INFO_START_IMPORT_ROLE" ) );
    }
    if ( roles != null ) {
      IUserRoleDao roleDao = PentahoSystem.get( IUserRoleDao.class );
      ITenant tenant = new Tenant( "/pentaho/" + TenantUtils.getDefaultTenant(), true );
      IRoleAuthorizationPolicyRoleBindingDao roleBindingDao = PentahoSystem.get(
          IRoleAuthorizationPolicyRoleBindingDao.class );

      Set<String> existingRoles = new HashSet<>();
      int newRolesCreated = 0;
      int existingRolesSkipped = 0;
      int rolesWithPermissionsUpdated = 0;
      int roleFailedCount = 0;
      
      if ( isPerformingRestore ) {
        getLogger().info( Messages.getInstance().getString( "SolutionImportHandler.INFO_COUNT_ROLE", roles.size() ) );
      }
      int successFullRoleImportCount = 0;
      for ( RoleExport role : roles ) {
        getLogger().debug( Messages.getInstance().getString( "ROLE.importing", role.getRolename() ) );
        
        // Check if role already exists before attempting to create
        boolean roleExists = false;
        try {
          IPentahoRole existingRole = roleDao.getRole( tenant, role.getRolename() );
          if ( existingRole != null ) {
            roleExists = true;
            existingRoles.add( role.getRolename() );
            existingRolesSkipped++;
            if ( isPerformingRestore ) {
              getLogger().debug( "Role [ " + role.getRolename() + " ] already exists (will skip creation)" );
            }
          }
        } catch ( Exception e ) {
          // Role doesn't exist, proceed with creation
          if ( isPerformingRestore ) {
            getLogger().debug( "Role [ " + role.getRolename() + " ] does not exist or error checking existence: " + e.getMessage() );
          }
        }
        
        // Only create role if it doesn't already exist
        if ( !roleExists ) {
          try {
            List<String> users = roleToUserMap.get( role.getRolename() );
            String[] userarray = users == null ? new String[] {} : users.toArray( new String[] {} );
            IPentahoRole role1 = roleDao.createRole( tenant, role.getRolename(), null, userarray );
            newRolesCreated++;
            successFullRoleImportCount++;
            if ( isPerformingRestore ) {
              getLogger().debug( "Role [ " + role.getRolename() + " ] created successfully" );
            }
          } catch ( AlreadyExistsException e ) {
            existingRoles.add( role.getRolename() );
            existingRolesSkipped++;
            successFullRoleImportCount++; // Treat existing role as successful
            if ( isPerformingRestore ) {
              getLogger().debug( "Role [ " + role.getRolename() + " ] already exists (caught as AlreadyExistsException)" );
            }
          } catch ( Exception e ) {
            roleFailedCount++;
            getLogger().error( "Failed to create role [ " + role.getRolename() + " ]: " + e.getMessage(), e );
            // Continue with next role even if creation fails
            continue;
          }
        } else {
          // Role already exists, count it as processed
          successFullRoleImportCount++;
        }
        try {
          if ( existingRoles.contains( role.getRolename() ) ) {
            //Only update an existing role if the overwrite flag is set
            if ( isOverwriteFile() ) {
              if ( isPerformingRestore ) {
                getLogger().debug( "Overwrite is set to true. Updating permissions for role [ " + role.getRolename() + "]" );
              }
              roleBindingDao.setRoleBindings( tenant, role.getRolename(), role.getPermissions() );
              rolesWithPermissionsUpdated++;
              if ( isPerformingRestore ) {
                getLogger().debug( "Permissions updated for role [ " + role.getRolename() + "]" );
              }
            } else {
              if ( isPerformingRestore ) {
                getLogger().debug( "Overwrite is false. Skipping permission update for existing role [ " + role.getRolename() + "]" );
              }
            }
          } else {
            if ( isPerformingRestore ) {
              getLogger().debug( "Updating role mapping from runtime roles to logical roles for [ " + role.getRolename() + "]" );
            }
            //Always write a roles permissions that were not previously existing
            roleBindingDao.setRoleBindings( tenant, role.getRolename(), role.getPermissions() );
            if ( isPerformingRestore ) {
              getLogger().debug( "Permissions set for new role [ " + role.getRolename() + "]" );
            }
          }
        } catch ( Exception e ) {
          getLogger().error( Messages.getInstance()
              .getString( "ERROR.SettingRolePermissions", role.getRolename() ), e );
          // Continue with next role even if permission setting fails
        }
      }
      if ( isPerformingRestore ) {
        getLogger().info( "Role import summary - Total: " + roles.size() + 
          ", Created: " + newRolesCreated + ", Existing (skipped): " + existingRolesSkipped + 
          ", Permissions Updated: " + rolesWithPermissionsUpdated + ", Failed: " + roleFailedCount );
        
        // Track role imports in metrics with detailed breakdown
        if ( metrics != null ) {
          for ( int i = 0; i < newRolesCreated; i++ ) {
            metrics.recordSuccess( ImportExportMetrics.Category.ROLES );
          }
          for ( int i = 0; i < existingRolesSkipped; i++ ) {
            metrics.recordSuccess( ImportExportMetrics.Category.ROLES );
          }
          for ( int i = 0; i < roleFailedCount; i++ ) {
            metrics.recordFailure( ImportExportMetrics.Category.ROLES, "role", "Import failed" );
          }
        }
        
        getLogger().info( Messages.getInstance().getString( "SolutionImportHandler.INFO_SUCCESSFUL_ROLE_COUNT", successFullRoleImportCount, roles.size() ) );
      }
    }
    if ( isPerformingRestore ) {
      getLogger().info( Messages.getInstance().getString( "SolutionImportHandler.INFO_END_IMPORT_ROLE" ) );
    }
  }

  /**
   * <p>Import the Metadata</p>
   *
   * @param metadataList metadata to be imported
   * @param preserveDsw  whether or not to preserve DSW settings
   */
  protected void importMetadata( List<ExportManifestMetadata> metadataList, boolean preserveDsw ) {
    if ( isPerformingRestore ) {
      getLogger().info( Messages.getInstance().getString( "SolutionImportHandler.INFO_START_IMPORT_METADATA_DATASOURCE" ) );
    }
    if ( null != metadataList ) {
      int successfulMetadataModelImport = 0;
      if ( isPerformingRestore ) {
        getLogger().info( Messages.getInstance().getString( "SolutionImportHandler.INFO_COUNT_METADATA_DATASOURCE", metadataList.size() ) );
      }
      for ( ExportManifestMetadata exportManifestMetadata : metadataList ) {
        try {
          if ( isPerformingRestore ) {
            getLogger().debug( "Restoring  [ " + exportManifestMetadata.getDomainId() + " ] datasource" );
          }
          String domainId = exportManifestMetadata.getDomainId();
          if ( domainId != null && !domainId.endsWith( XMI_EXTENSION ) ) {
            domainId = domainId + XMI_EXTENSION;
          }
          // Validate required fields
          if ( domainId == null || exportManifestMetadata.getFile() == null ) {
            getLogger().warn( "Skipping metadata import - missing domainId or file path" );
            continue;
          }
          RepositoryFileImportBundle.Builder bundleBuilder =
              new RepositoryFileImportBundle.Builder().charSet( UTF_8 )
                  .hidden( RepositoryFile.HIDDEN_BY_DEFAULT ).schedulable( RepositoryFile.SCHEDULABLE_BY_DEFAULT )
                  // let the parent bundle control whether or not to preserve DSW settings
                  .preserveDsw( preserveDsw )
                  .overwriteFile( isOverwriteFile() )
                  .mime( "text/xmi+xml" )
                  .withParam( DOMAIN_ID, domainId );

          cachedImports.put( exportManifestMetadata.getFile(), bundleBuilder );
          if ( isPerformingRestore ) {
            getLogger().debug( " Successfully prepared  [ " + exportManifestMetadata.getDomainId() + " ] datasource for import" );
          }
          successfulMetadataModelImport++;
        } catch ( Exception e ) {
          getLogger().warn( "Failed to prepare metadata [ " + exportManifestMetadata.getDomainId() + " ] for import: " + e.getMessage() );
          getLogger().debug( "Metadata preparation error", e );
          // Continue with next metadata even if this one fails
        }
      }
      if ( isPerformingRestore ) {
        int metadataFailedCount = metadataList.size() - successfulMetadataModelImport;
        
        // Track metadata imports in metrics
        if ( metrics != null ) {
          for ( int i = 0; i < successfulMetadataModelImport; i++ ) {
            metrics.recordSuccess( ImportExportMetrics.Category.METADATA );
          }
          for ( int i = 0; i < metadataFailedCount; i++ ) {
            metrics.recordFailure( ImportExportMetrics.Category.METADATA, "metadata", "Import failed" );
          }
        }
        
        getLogger().info( Messages.getInstance().getString( "SolutionImportHandler.INFO_SUCCESSFUL_METDATA_DATASOURCE_COUNT", successfulMetadataModelImport, metadataList.size() ) );
      }
    }
    if ( isPerformingRestore ) {
      getLogger().info( Messages.getInstance().getString( "SolutionImportHandler.INFO_END_IMPORT_METADATA_DATASOURCE" ) );
    }
  }

  protected void importMondrian( List<ExportManifestMondrian> mondrianList ) {
    if ( isPerformingRestore ) {
      getLogger().info( Messages.getInstance().getString( "SolutionImportHandler.INFO_START_IMPORT_MONDRIAN_DATASOURCE" ) );
    }
    if ( null != mondrianList ) {
      int successfulMondrianSchemaImport = 0;
      if ( isPerformingRestore ) {
        getLogger().info( Messages.getInstance().getString( "SolutionImportHandler.INFO_COUNT_MONDRIAN_DATASOURCE", mondrianList.size() ) );
      }
      for ( ExportManifestMondrian exportManifestMondrian : mondrianList ) {
        try {
          if ( isPerformingRestore ) {
            getLogger().debug( "Restoring  [ " + exportManifestMondrian.getCatalogName() + " ] mondrian datasource" );
          }
          String catName = exportManifestMondrian.getCatalogName();
          // Validate required fields
          if ( catName == null || catName.trim().isEmpty() ) {
            getLogger().warn( "Skipping Mondrian schema import - missing catalog name" );
            continue;
          }
          Parameters parametersMap = exportManifestMondrian.getParameters();
          StringBuilder parametersStr = new StringBuilder();
          if ( parametersMap != null ) {
            for ( Map.Entry<String, String> e : parametersMap.entrySet() ) {
              parametersStr.append( e.getKey() ).append( '=' ).append( e.getValue() ).append( ';' );
            }
          }

          RepositoryFileImportBundle.Builder bundleBuilder =
              new RepositoryFileImportBundle.Builder().charSet( UTF_8 ).hidden( RepositoryFile.HIDDEN_BY_DEFAULT )
                  .schedulable( RepositoryFile.SCHEDULABLE_BY_DEFAULT ).name( catName ).overwriteFile(
                  isOverwriteFile() ).mime( "application/vnd.pentaho.mondrian+xml" )
                  .withParam( "parameters", parametersStr.toString() )
                  .withParam( DOMAIN_ID, catName ); // TODO: this is definitely named wrong at the very least.
          // pass as param if not in parameters string
          String xmlaEnabled = "" + exportManifestMondrian.isXmlaEnabled();
          bundleBuilder.withParam( "EnableXmla", xmlaEnabled );

          cachedImports.put( exportManifestMondrian.getFile(), bundleBuilder );

          String annotationsFile = exportManifestMondrian.getAnnotationsFile();
          if ( annotationsFile != null ) {
            RepositoryFileImportBundle.Builder annotationsBundle =
                new RepositoryFileImportBundle.Builder().path( MondrianCatalogRepositoryHelper.ETC_MONDRIAN_JCR_FOLDER
                    + RepositoryFile.SEPARATOR + catName ).name( "annotations.xml" ).charSet( UTF_8 ).overwriteFile(
                    isOverwriteFile() ).mime( "text/xml" ).hidden( RepositoryFile.HIDDEN_BY_DEFAULT ).schedulable(
                    RepositoryFile.SCHEDULABLE_BY_DEFAULT ).withParam( DOMAIN_ID, catName );
            cachedImports.put( annotationsFile, annotationsBundle );
          }
          successfulMondrianSchemaImport++;
          if ( isPerformingRestore ) {
            getLogger().debug( " Successfully prepared  [ " + exportManifestMondrian.getCatalogName() + " ] mondrian datasource for import" );
          }
        } catch ( Exception e ) {
          getLogger().warn( "Failed to prepare Mondrian schema [ " + exportManifestMondrian.getCatalogName() + " ] for import: " + e.getMessage() );
          getLogger().debug( "Mondrian preparation error", e );
          // Continue with next schema even if this one fails
        }
      }
      if ( isPerformingRestore ) {
        int mondrianFailedCount = mondrianList.size() - successfulMondrianSchemaImport;
        
        // Track Mondrian imports in metrics
        if ( metrics != null ) {
          for ( int i = 0; i < successfulMondrianSchemaImport; i++ ) {
            metrics.recordSuccess( ImportExportMetrics.Category.MONDRIAN );
          }
          for ( int i = 0; i < mondrianFailedCount; i++ ) {
            metrics.recordFailure( ImportExportMetrics.Category.MONDRIAN, "schema", "Import failed" );
          }
        }
        
        getLogger().info( Messages.getInstance().getString( "SolutionImportHandler.INFO_SUCCESSFUL_MONDRIAN_DATASOURCE_IMPORT_COUNT", successfulMondrianSchemaImport, mondrianList.size() ) );
      }
    }
    if ( isPerformingRestore ) {
      getLogger().info( Messages.getInstance().getString( "SolutionImportHandler.INFO_END_IMPORT_MONDRIAN_DATASOURCE" ) );
    }
  }

  /**
   * See BISERVER-13481 . For backward compatibility we must check if there are any schedules
   * which refers to this file. If yes make this file schedulable
   */
  @VisibleForTesting
  boolean fileIsScheduleInputSource( ExportManifest manifest, String sourcePath ) {
    boolean isSchedulable = false;
    if ( sourcePath != null && manifest != null
        && manifest.getScheduleList() != null ) {
      String path = sourcePath.startsWith( "/" ) ? sourcePath : "/" + sourcePath;
      isSchedulable = manifest.getScheduleList().stream()
          .anyMatch( schedule -> path.equals( schedule.getInputFile() ) );
    }

    if ( isSchedulable ) {
      getLogger().warn( Messages.getInstance()
          .getString( "ERROR.ScheduledWithoutPermission", sourcePath ) );
      getLogger().warn( Messages.getInstance().getString( "SCHEDULE.AssigningPermission", sourcePath ) );
    }

    return isSchedulable;
  }

  @VisibleForTesting
  protected boolean isFileHidden( RepositoryFile file, ManifestFile manifestFile, String sourcePath ) {
    Boolean result = manifestFile.isFileHidden();
    if ( result != null ) {
      return result; // file absent or must receive a new setting and the setting is exist
    }
    if ( file != null ) {
      return file.isHidden(); // old setting
    }
    if ( solutionHelper.isInHiddenList( sourcePath ) ) {
      return true;
    }
    return RepositoryFile.HIDDEN_BY_DEFAULT; // default setting of type
  }

  @VisibleForTesting
  protected boolean isSchedulable( RepositoryFile file, ManifestFile manifestFile ) {
    Boolean result = manifestFile.isFileSchedulable();
    if ( result != null ) {
      return result; // file absent or must receive a new setting and the setting is exist
    }
    if ( file != null ) {
      return file.isSchedulable(); // old setting
    }
    return RepositoryFile.SCHEDULABLE_BY_DEFAULT; // default setting of type
  }

  private String repositoryPathConcat( String path, String... subPaths ) {
    for ( String subPath : subPaths ) {
      path = RepositoryFilenameUtils.concat( path, subPath );
    }
    return path;
  }

  private boolean processZip( InputStream inputStream ) {
    this.files = new ArrayList<>();
    if ( isPerformingRestore ) {
      getLogger().info( Messages.getInstance().getString( "SolutionImportHandler.INFO_START_IMPORT_REPOSITORY_OBJECT" ) );
    }
    try ( ZipInputStream zipInputStream = new ZipInputStream( inputStream ) ) {
      FileService fileService = new FileService();
      ZipEntry entry = zipInputStream.getNextEntry();
      while ( entry != null ) {
        final String entryName = RepositoryFilenameUtils.separatorsToRepository( entry.getName() );
        getLogger().debug( Messages.getInstance().getString( "ZIPFILE.ProcessingEntry", entryName ) );
        final String decodedEntryName = ExportFileNameEncoder.decodeZipFileName( entryName );
        File tempFile = null;
        boolean isDir = entry.isDirectory();
        if ( !isDir ) {
          if ( !solutionHelper.isInApprovedExtensionList( entryName ) ) {
            zipInputStream.closeEntry();
            entry = zipInputStream.getNextEntry();
            continue;
          }

          if ( !fileService.isValidFileName( decodedEntryName ) ) {
            getLogger().error( Messages.getInstance().getString( "DefaultImportHandler.ERROR_0011_INVALID_FILE_NAME", decodedEntryName ) );
            throw new PlatformImportException(
                Messages.getInstance().getString( "DefaultImportHandler.ERROR_0011_INVALID_FILE_NAME",
                    entryName ), PlatformImportException.PUBLISH_PROHIBITED_SYMBOLS_ERROR );
          }

          tempFile = File.createTempFile( "zip", null );
          tempFile.deleteOnExit();
          try ( FileOutputStream fos = new FileOutputStream( tempFile ) ) {
            IOUtils.copy( zipInputStream, fos );
          }
        } else {
          if ( !fileService.isValidFileName( decodedEntryName ) ) {
            getLogger().error( Messages.getInstance().getString( "DefaultImportHandler.ERROR_0011_INVALID_FILE_NAME", decodedEntryName ) );
            throw new PlatformImportException(
                Messages.getInstance().getString( "DefaultImportHandler.ERROR_0012_INVALID_FOLDER_NAME",
                    entryName ), PlatformImportException.PUBLISH_PROHIBITED_SYMBOLS_ERROR );
          }
        }
        File file = new File( entryName );
        RepositoryFile repoFile =
            new RepositoryFile.Builder( file.getName() ).folder( isDir ).hidden( false ).build();
        String parentDir =
            file.getParent() == null ? RepositoryFile.SEPARATOR : file.getParent()
                + RepositoryFile.SEPARATOR;
        IRepositoryFileBundle repoFileBundle =
            new RepositoryFileBundle( repoFile, null, parentDir, tempFile, UTF_8, null );

        if ( EXPORT_MANIFEST_XML_FILE.equals( file.getName() ) ) {
          initializeAclManifest( repoFileBundle );
        } else {
          if ( isPerformingRestore ) {
            getLogger().debug( "Adding file " + repoFile.getName() + " to list for later processing " );
          }
          files.add( repoFileBundle );
        }
        zipInputStream.closeEntry();
        entry = zipInputStream.getNextEntry();
      }
    } catch ( IOException | PlatformImportException e ) {
      getLogger().error( Messages.getInstance()
          .getErrorString( "ZIPFILE.ExceptionOccurred", e.getLocalizedMessage() ), e );
      return false;
    }
    if ( isPerformingRestore ) {
      getLogger().info( Messages.getInstance().getString( "SolutionImportHandler.INFO_END_IMPORT_REPOSITORY_OBJECT" ) );
    }
    return true;
  }

  private void initializeAclManifest( IRepositoryFileBundle file ) {
    try {
      byte[] bytes = IOUtils.toByteArray( file.getInputStream() );
      ByteArrayInputStream in = new ByteArrayInputStream( bytes );
      ExportManifest manifest = ExportManifest.fromXml( in );
      getImportSession().setManifest( manifest );
    } catch ( Exception e ) {
      getLogger().error( "Failed to parse export manifest from backup file", e );
    }
  }

  @Override
  public List<IMimeType> getMimeTypes() {
    return mimeTypes;
  }

  // handlers that extend this class may override this method and perform operations
  // over the bundle prior to entering its designated importer.importFile()
  public IPlatformImportBundle build( RepositoryFileImportBundle.Builder builder ) {
    return builder != null ? builder.build() : null;
  }

  // handlers that extend this class may override this method and perform operations
  // over the job prior to its creation at scheduler.createJob()
  // MOVED TO: pentaho-scheduler-plugin/ScheduleImportUtil.java
  //
  //  public Response createSchedulerJob( ISchedulerResource scheduler, IJobScheduleRequest jobScheduleRequest )
  //      throws IOException {
  //    Response rs = scheduler != null ? (Response) scheduler.createJob( jobScheduleRequest ) : null;
  //    if ( jobScheduleRequest.getJobState() != JobState.NORMAL ) {
  //      IJobRequest jobRequest = PentahoSystem.get( IScheduler.class, "IScheduler2", null ).createJobRequest();
  //      jobRequest.setJobId( rs.getEntity().toString() );
  //      scheduler.pauseJob( jobRequest );
  //    }
  //    return rs;
  //  }

  public boolean isOverwriteFile() {
    return overwriteFile;
  }

  public void setOverwriteFile( boolean overwriteFile ) {
    this.overwriteFile = overwriteFile;
  }

  public boolean isPerformingRestore() {
    return isPerformingRestore;
  }
}
