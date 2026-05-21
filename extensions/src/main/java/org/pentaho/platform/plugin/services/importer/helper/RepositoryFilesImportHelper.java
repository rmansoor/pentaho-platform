/*
 * This program is free software; you can redistribute it and/or modify it under the
 * terms of the GNU General Public License, version 2 as published by the Free Software
 * Foundation.
 *
 * You should have received a copy of the GNU General Public License along with this
 * program; if not, you can obtain a copy at http://www.gnu.org/licenses/gpl-2.0.html
 * or from the Free Software Foundation, Inc.,
 * 51 Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA.
 *
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY;
 * without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 * See the GNU General Public License for more details.
 */

package org.pentaho.platform.plugin.services.importer.helper;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;

import org.apache.commons.io.IOUtils;
import org.pentaho.platform.api.importexport.IImportHelper;
import org.pentaho.platform.api.importexport.ImportException;
import org.pentaho.platform.plugin.services.importer.PlatformImportException;
import org.pentaho.platform.api.repository2.unified.IPlatformImportBundle;
import org.pentaho.platform.api.repository2.unified.RepositoryFile;
import org.pentaho.platform.api.scheduler2.IScheduler;
import org.pentaho.platform.api.mimetype.IPlatformMimeResolver;
import org.pentaho.platform.engine.core.system.PentahoSystem;
import org.pentaho.platform.plugin.services.importexport.BackupComponentConfig;
import org.pentaho.platform.plugin.services.importexport.ExportFileNameEncoder;
import org.pentaho.platform.plugin.services.importer.IPlatformImporter;
import org.pentaho.platform.plugin.services.importer.LocaleFilesProcessor;
import org.pentaho.platform.plugin.services.importer.PentahoPlatformImporter;
import org.pentaho.platform.plugin.services.importer.RepositoryFileImportBundle;
import org.pentaho.platform.plugin.services.importexport.exportManifest.ExportManifest;
import org.pentaho.platform.plugin.services.importexport.ImportSession.ManifestFile;
import org.pentaho.platform.plugin.services.importexport.ImportSource.IRepositoryFileBundle;
import org.pentaho.platform.plugin.services.importexport.ImportExportMetrics;
import org.pentaho.platform.plugin.services.importer.SolutionFileImportHelper;
import org.pentaho.platform.plugin.services.messages.Messages;
import org.pentaho.platform.repository.RepositoryFilenameUtils;
import org.pentaho.platform.plugin.services.importer.SolutionImportHandler;

/**
 * Import helper for repository content (files and folders) restoration.
 * Handles importing repository files, folders, and directory structures from backup.
 *
 * Profile: CONTENT
 * Filters: isIncludeContent() OR has dependencies (for schedule file dependencies)
 */
public class RepositoryFilesImportHelper implements IImportHelper {

  private SolutionImportHandler solutionImportHandler;
  private IPlatformImportBundle bundle;

  @Override
  public String getName() {
    return "Repository Files and Folders Import Helper";
  }

  @Override
  public boolean shouldExecute( Object componentOverrides ) {
    // Execute if:
    // 1. Content is included in the profile, OR
    // 2. Schedules are included in the profile, OR  
    // 3. There are files in the manifest (for dependencies like schedule inputs)
    if ( componentOverrides == null ) {
      return true; // Full restore, include content
    }

    // Cast to BackupComponentConfig if available
    if ( componentOverrides instanceof BackupComponentConfig ) {
      BackupComponentConfig config = (BackupComponentConfig) componentOverrides;
      return config.isIncludeContent();
    }

    // If type is unknown, default to include
    return true;
  }

  @Override
  public void doImport( Object importArg ) throws ImportException {
    solutionImportHandler = (SolutionImportHandler) importArg;

    try {
      ExportManifest manifest = solutionImportHandler.getImportSession().getManifest();

      if ( manifest == null ) {
        if ( solutionImportHandler.isPerformingRestore() ) {
          solutionImportHandler.getLogger().debug( "Manifest is null - skipping repository files import" );
        }
        return;
      }

      if ( solutionImportHandler.isPerformingRestore() ) {
        solutionImportHandler.getLogger().info( "Starting repository files and folders import..." );
      }

      try {
        importRepositoryFilesAndFolders( manifest, bundle );

        if ( solutionImportHandler.isPerformingRestore() ) {
          solutionImportHandler.getLogger().info( "Successfully completed repository files import" );
        }
      } catch ( IOException e ) {
        if ( solutionImportHandler.isPerformingRestore() ) {
          solutionImportHandler.getLogger().error( "Failed to import repository files and folders: " + e.getMessage() );
          solutionImportHandler.getLogger().debug( "Repository files import error", e );
        }
        throw new ImportException( "Failed to import repository files and folders: " + e.getMessage(), e );
      }
    } catch ( Exception e ) {
      if ( solutionImportHandler.isPerformingRestore() ) {
        solutionImportHandler.getLogger().error( "Repository files import helper error: " + e.getMessage() );
      }
      throw new ImportException( "Repository files import helper failed: " + e.getMessage(), e );
    }
  }

  /**
   * Import folder entities from the manifest before importing files.
   * This ensures folders are created with correct ACLs and ownership from the manifest
   * instead of being created implicitly during file import with default (admin) permissions.
   */
  protected void importManifestFolderEntities( ExportManifest manifest, IPlatformImportBundle importBundle, IPlatformImporter importer ) {
    if ( manifest == null || manifest.getExportManifestEntities() == null || manifest.getExportManifestEntities().isEmpty() ) {
      return;
    }

    RepositoryFileImportBundle repoBundle = (RepositoryFileImportBundle) importBundle;
    String manifestVersion = manifest.getManifestInformation().getManifestVersion();
    
    int foldersImported = 0;
    
    // Process manifest entities in a sorted order (by path depth) to ensure parent folders are created first
    java.util.List<String> sortedPaths = new java.util.ArrayList<>();
    java.util.Set<String> processedFolders = new java.util.HashSet<>();
    
    // Collect all folder paths from manifest
    for ( org.pentaho.platform.plugin.services.importexport.exportManifest.ExportManifestEntity entity : manifest.getExportManifestEntities().values() ) {
      if ( entity.getRepositoryFile() != null && entity.getRepositoryFile().isFolder() ) {
        sortedPaths.add( entity.getPath() );
      }
    }
    
    // Sort by path depth (number of slashes) to process parent folders first
    sortedPaths.sort( new java.util.Comparator<String>() {
      @Override
      public int compare( String a, String b ) {
        return Integer.compare( countSlashes( a ), countSlashes( b ) );
      }
      
      private int countSlashes( String path ) {
        return (int) path.chars().filter( c -> c == '/' ).count();
      }
    });

    for ( String folderPath : sortedPaths ) {
      if ( processedFolders.contains( folderPath ) ) {
        continue;
      }

      org.pentaho.platform.plugin.services.importexport.exportManifest.ExportManifestEntity manifestEntity = manifest.getExportManifestEntity( folderPath );
      if ( manifestEntity == null ) {
        continue;
      }

      try {
        // Build folder bundle from manifest entity
        RepositoryFileImportBundle.Builder folderBundleBuilder = new RepositoryFileImportBundle.Builder();
        
        // Decode file name if needed
        String decodedPath = folderPath;
        String folderName = new java.io.File( folderPath ).getName();
        if ( manifestVersion != null ) {
          decodedPath = ExportFileNameEncoder.decodeZipFileName( folderPath );
          folderName = ExportFileNameEncoder.decodeZipFileName( folderName );
        }

        // Create folder file object
        RepositoryFile folderFile = manifestEntity.getRepositoryFile();
        if ( folderFile == null ) {
          continue;
        }

        // Set up folder bundle
        folderBundleBuilder.mime( "text/directory" );
        folderBundleBuilder.file( new RepositoryFile.Builder( folderFile )
            .path( decodedPath )
            .name( folderName )
            .title( folderFile.getTitle() != null ? folderFile.getTitle() : folderName )
            .folder( true )
            .build() );
        folderBundleBuilder.name( folderName );

        String repositoryFolderPath = RepositoryFilenameUtils.concat( repoBundle.getPath(), decodedPath );
        folderBundleBuilder.path( repositoryFolderPath );

        // Check if folder already exists in repository to prevent duplicates
        try {
          org.pentaho.platform.api.repository2.unified.IUnifiedRepository repo = 
              PentahoSystem.get( org.pentaho.platform.api.repository2.unified.IUnifiedRepository.class );
          if ( repo != null ) {
            RepositoryFile existingFolder = repo.getFile( repositoryFolderPath );
            if ( existingFolder != null && existingFolder.isFolder() ) {
              if ( solutionImportHandler.isPerformingRestore() ) {
                solutionImportHandler.getLogger().debug( "Folder already exists, skipping pre-import: " + repositoryFolderPath );
              }
              // Mark as processed but don't try to import it again
              processedFolders.add( folderPath );
              continue;
            }
          }
        } catch ( Exception e ) {
          if ( solutionImportHandler.isPerformingRestore() ) {
            solutionImportHandler.getLogger().debug( "Could not check if folder exists: " + e.getMessage() );
          }
        }

        // Apply ACL settings from manifest
        folderBundleBuilder.charSet( importBundle.getCharSet() );
        folderBundleBuilder.overwriteFile( importBundle.overwriteInRepository() );
        
        // CRITICAL: For manifest-imported folders, we MUST apply and retain the manifest ACLs
        // This ensures folders inherit their original owner from the export manifest
        folderBundleBuilder.applyAclSettings( true );
        folderBundleBuilder.retainOwnership( true );
        folderBundleBuilder.overwriteAclSettings( true );
        
        // Set required properties from manifest entity to prevent NullPointerException
        // The hidden and schedulable properties must be set explicitly
        folderBundleBuilder.hidden( folderFile.isHidden() != null ? folderFile.isHidden() : false );
        folderBundleBuilder.schedulable( folderFile.isSchedulable() != null ? folderFile.isSchedulable() : false );
        
        // Get ACL from manifest for this folder
        org.pentaho.platform.api.repository2.unified.RepositoryFileAcl manifestAcl = manifestEntity.getRepositoryFileAcl();
        folderBundleBuilder.acl( manifestAcl );

        IPlatformImportBundle folderImportBundle = solutionImportHandler.build( folderBundleBuilder );
        
        try {
          // Get parent path from manifest for better parent folder resolution
          String parentPath = manifestEntity.getRepositoryFile().getPath();
          if ( parentPath != null && !parentPath.isEmpty() && !parentPath.equals( "/" ) ) {
            // Extract parent from the folder path
            String calculatedParentPath = RepositoryFilenameUtils.getFullPathNoEndSeparator( repositoryFolderPath );
            
            try {
              // Get repository and verify parent exists
              org.pentaho.platform.api.repository2.unified.IUnifiedRepository repo = 
                  PentahoSystem.get( org.pentaho.platform.api.repository2.unified.IUnifiedRepository.class );
              
              if ( repo != null && calculatedParentPath != null && !calculatedParentPath.isEmpty() && !calculatedParentPath.equals( "/" ) ) {
                RepositoryFile parentFile = repo.getFile( calculatedParentPath );
                if ( parentFile != null && parentFile.getId() != null ) {
                  if ( solutionImportHandler.isPerformingRestore() ) {
                    solutionImportHandler.getLogger().debug( "Parent folder found: " + calculatedParentPath + " with ID: " + parentFile.getId() );
                  }
                } else {
                  if ( solutionImportHandler.isPerformingRestore() ) {
                    solutionImportHandler.getLogger().debug( "Parent folder does not exist, will be created JIT: " + calculatedParentPath );
                  }
                }
              }
            } catch ( Exception e ) {
              if ( solutionImportHandler.isPerformingRestore() ) {
                solutionImportHandler.getLogger().debug( "Could not verify parent folder: " + e.getMessage() );
              }
            }
          }
          
          // Import folder with manifest ACL
          importer.importFile( folderImportBundle );
        } catch ( Exception e ) {
          // If folder import fails, log the error but continue
          // This can happen if parent doesn't exist yet, but parent folders will be created
          // as needed during the main file import process
          if ( solutionImportHandler.isPerformingRestore() ) {
            solutionImportHandler.getLogger().warn( "Could not import folder from manifest: " 
                + repositoryFolderPath + " - " + e.getMessage() + " (will attempt JIT creation)" );
            solutionImportHandler.getLogger().debug( "Folder import stack trace", e );
          }
          // Continue to next folder even if this one fails
          // Mark as processed to avoid duplicate attempts
          processedFolders.add( folderPath );
          continue;
        }
        
        processedFolders.add( folderPath );
        foldersImported++;

        if ( solutionImportHandler.isPerformingRestore() ) {
          solutionImportHandler.getLogger().debug( "Successfully imported folder from manifest: " + repositoryFolderPath );
        }
      } catch ( Exception e ) {
        if ( solutionImportHandler.isPerformingRestore() ) {
          solutionImportHandler.getLogger().warn( "Could not import folder from manifest: " + folderPath + " - " + e.getMessage() );
        }
        // Continue processing other folders even if one fails
      }
    }

    if ( solutionImportHandler.isPerformingRestore() && foldersImported > 0 ) {
      solutionImportHandler.getLogger().info( "Imported " + foldersImported + " folders from manifest before file import" );
    }
  }

  /**
   * Import repository files and folders from the backup bundle.
   * This is the core implementation for file/folder restoration.
   */
  protected void importRepositoryFilesAndFolders( ExportManifest manifest, IPlatformImportBundle importBundle ) throws IOException {
    if ( solutionImportHandler.isPerformingRestore() ) {
      solutionImportHandler.getLogger().info( Messages.getInstance().getString( "SolutionImportHandler.INFO_START_IMPORT_FILEFOLDER" ) );
      solutionImportHandler.getLogger().info( Messages.getInstance().getString( "SolutionImportHandler.INFO_COUNT_FILEFOLDER", solutionImportHandler.getFiles().size() ) );
    }
    Integer successfulFilesImportCount = 0;
    String manifestVersion = null;
    if ( manifest != null ) {
      manifestVersion = manifest.getManifestInformation().getManifestVersion();
    }
    RepositoryFileImportBundle repoBundle = (RepositoryFileImportBundle) importBundle;

    LocaleFilesProcessor localeFilesProcessor = new LocaleFilesProcessor();
    IPlatformImporter importer = PentahoSystem.get( IPlatformImporter.class );

    // Import manifest folder entities first to ensure correct ACLs before importing files
    // This prevents parent folders from being created with default (admin) permissions during file import
    if ( manifest != null && manifest.getExportManifestEntities() != null ) {
      importManifestFolderEntities( manifest, importBundle, importer );
    }

    for ( IRepositoryFileBundle fileBundle : solutionImportHandler.getFiles() ) {
      String fileName = fileBundle.getFile().getName();
      String actualFilePath = fileBundle.getPath();
      if ( manifestVersion != null ) {
        fileName = ExportFileNameEncoder.decodeZipFileName( fileName );
        actualFilePath = ExportFileNameEncoder.decodeZipFileName( actualFilePath );
      }
      String repositoryFilePath =
          RepositoryFilenameUtils.concat( PentahoPlatformImporter.computeBundlePath( actualFilePath ), fileName );

      if ( solutionImportHandler.getCachedImports().containsKey( repositoryFilePath ) ) {
        solutionImportHandler.getLogger().debug( "Repository object with path [ " + repositoryFilePath + " ] found in the cache" );
        byte[] bytes = IOUtils.toByteArray( fileBundle.getInputStream() );
        RepositoryFileImportBundle.Builder builder = solutionImportHandler.getCachedImports().get( repositoryFilePath );
        builder.input( new ByteArrayInputStream( bytes ) );

        try {
          importer.importFile( solutionImportHandler.build( builder ) );
          if ( solutionImportHandler.isPerformingRestore() ) {
            solutionImportHandler.getLogger().debug( "Successfully restored repository object with path [ " + repositoryFilePath + " ] from the cache" );
          }
          successfulFilesImportCount++;
          continue;
        } catch ( PlatformImportException e ) {
          if ( solutionImportHandler.isPerformingRestore() ) {
            solutionImportHandler.getLogger().error( Messages.getInstance().getString( "SolutionImportHandler.ERROR_IMPORTING_REPOSITORY_OBJECT", repositoryFilePath, e.getLocalizedMessage() ) );
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
        repositoryFilePath = repoBundle.getPath();
      } else {
        byte[] bytes = IOUtils.toByteArray( fileBundle.getInputStream() );
        bundleInputStream = new ByteArrayInputStream( bytes );
        // If is locale file store it for later processing.
        if ( localeFilesProcessor.isLocaleFile( fileBundle, repoBundle.getPath(), bytes ) ) {
          solutionImportHandler.getLogger().trace( Messages.getInstance()
              .getString( "SolutionImportHandler.SkipLocaleFile", repositoryFilePath ) );
          continue;
        }
        bundleBuilder.input( bundleInputStream );
        IPlatformMimeResolver mimeResolver = PentahoSystem.get( IPlatformMimeResolver.class );
        bundleBuilder.mime( mimeResolver.resolveMimeForFileName( fileName ) );

        String filePath =
            ( decodedFilePath.equals( "/" ) || decodedFilePath.equals( "\\" ) ) ? "" : decodedFilePath;
        repositoryFilePath = RepositoryFilenameUtils.concat( repoBundle.getPath(), filePath );
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

      java.io.Serializable metadata = solutionImportHandler.getImportSession().processExtraMetaDataForFile( sourcePath );
      if ( metadata != null ) {
        if ( metadata instanceof org.pentaho.platform.api.repository2.unified.RepositoryFileExtraMetaData ) {
          org.pentaho.platform.api.repository2.unified.RepositoryFileExtraMetaData extraMetaData = 
              (org.pentaho.platform.api.repository2.unified.RepositoryFileExtraMetaData) metadata;
          java.util.Map<String, java.io.Serializable> extraMap = extraMetaData.getExtraMetaData();
          boolean isFileAGC = extraMap.containsKey( IScheduler.RESERVEDMAPKEY_LINEAGE_ID );
          BackupComponentConfig componentOverrides = solutionImportHandler.getImportSession().getComponentOverrides();
          if ( componentOverrides != null && !componentOverrides.isIncludeGeneratedContent() && isFileAGC ) {
            if ( solutionImportHandler.isPerformingRestore() ) {
              solutionImportHandler.getLogger().debug( "Skipping generated content file during restore: " + sourcePath
                + " (includeGeneratedContent=" + componentOverrides.isIncludeGeneratedContent() + ")" );
            }
            continue;
          }
        }
      }

      solutionImportHandler.getImportSession().setCurrentManifestKey( sourcePath );

      bundleBuilder.charSet( importBundle.getCharSet() );
      bundleBuilder.overwriteFile( importBundle.overwriteInRepository() );
      bundleBuilder.applyAclSettings( importBundle.isApplyAclSettings() );
      bundleBuilder.retainOwnership( importBundle.isRetainOwnership() );
      bundleBuilder.overwriteAclSettings( importBundle.isOverwriteAclSettings() );
      bundleBuilder.acl( solutionImportHandler.getImportSession().processAclForFile( sourcePath ) );
      if ( metadata instanceof org.pentaho.platform.api.repository2.unified.RepositoryFileExtraMetaData ) {
        bundleBuilder.extraMetaData( (org.pentaho.platform.api.repository2.unified.RepositoryFileExtraMetaData) metadata );
      }

      RepositoryFile file = solutionImportHandler.getFile( repoBundle, fileBundle );
      ManifestFile manifestFile = solutionImportHandler.getImportSession().getManifestFile( sourcePath, file != null );

      bundleBuilder.hidden( solutionImportHandler.isFileHidden( file, manifestFile, sourcePath ) );
      boolean isSchedulable = solutionImportHandler.isSchedulable( file, manifestFile );

      if ( isSchedulable ) {
        bundleBuilder.schedulable( isSchedulable );
      } else {
        bundleBuilder.schedulable( solutionImportHandler.fileIsScheduleInputSource( manifest, sourcePath ) );
      }

      IPlatformImportBundle platformImportBundle = solutionImportHandler.build( bundleBuilder );
      try {
        // Skip metadata files if datasources are not included in selective restore
        BackupComponentConfig componentOverrides = solutionImportHandler.getImportSession().getComponentOverrides();
        if ( componentOverrides != null && !componentOverrides.isIncludeDatasources() ) {
          String bundlePath = platformImportBundle.getPath() + platformImportBundle.getName();
          if ( bundlePath != null && bundlePath.endsWith( ".xmi" ) ) {
            if ( solutionImportHandler.isPerformingRestore() ) {
              solutionImportHandler.getLogger().debug( "Skipping metadata file during restore: " + bundlePath + " (datasources not included)" );
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
        if ( solutionImportHandler.isPerformingRestore() ) {
          solutionImportHandler.getLogger().debug( "Successfully restored repository object with path [ " + repositoryFilePath + " ]" );
        }
      } catch ( PlatformImportException e ) {
        if ( solutionImportHandler.isPerformingRestore() ) {
          solutionImportHandler.getLogger().error( Messages.getInstance().getString( "SolutionImportHandler.ERROR_IMPORTING_REPOSITORY_OBJECT", repositoryFilePath, e.getLocalizedMessage() ) );
        }
      }

      if ( bundleInputStream != null ) {
        bundleInputStream.close();
        bundleInputStream = null;
      }
    }

    // Process locale files.
    if ( solutionImportHandler.isPerformingRestore() ) {
      solutionImportHandler.getLogger().info( Messages.getInstance().getString( "SolutionImportHandler.INFO_START_IMPORT_LOCALEFILE" ) );
    }
    int successfulLocaleFilesProcessed = 0;
    try {
      successfulLocaleFilesProcessed = localeFilesProcessor.processLocaleFiles( importer );
    } catch ( PlatformImportException e ) {
      if ( solutionImportHandler.isPerformingRestore() ) {
        solutionImportHandler.getLogger().error( Messages.getInstance().getString( "SolutionImportHandler.ERROR_IMPORTING_LOCALE_FILE", e.getLocalizedMessage() ) );
      }
    } finally {
      if ( solutionImportHandler.isPerformingRestore() ) {
        solutionImportHandler.getLogger().info( Messages.getInstance().getString( "SolutionImportHandler.INFO_END_IMPORT_LOCALEFILE" ) );
      }
    }

    if ( solutionImportHandler.isPerformingRestore() ) {
      int totalFileCount = successfulFilesImportCount + successfulLocaleFilesProcessed;
      int totalAttempted = solutionImportHandler.getFiles().size();
      int failedCount = totalAttempted - totalFileCount;
      
      // Track file imports in metrics
      ImportExportMetrics metrics = solutionImportHandler.getMetrics();
      if ( metrics != null ) {
        for ( int i = 0; i < totalFileCount; i++ ) {
          metrics.recordSuccess( ImportExportMetrics.Category.FILES );
        }
        for ( int i = 0; i < failedCount; i++ ) {
          metrics.recordFailure( ImportExportMetrics.Category.FILES, "file", "Import failed" );
        }
      }
      
      solutionImportHandler.getLogger().info( Messages.getInstance().getString( "SolutionImportHandler.INFO_SUCCESSFUL_REPOSITORY_IMPORT_COUNT", successfulFilesImportCount + successfulLocaleFilesProcessed, solutionImportHandler.getFiles().size() ) );
      solutionImportHandler.getLogger().info( Messages.getInstance().getString( "SolutionImportHandler.INFO_END_IMPORT_FILEFOLDER" ) );
    }
  }

  /**
   * Set the import bundle for file import operations
   */
  public void setBundle( IPlatformImportBundle bundle ) {
    this.bundle = bundle;
  }
}
