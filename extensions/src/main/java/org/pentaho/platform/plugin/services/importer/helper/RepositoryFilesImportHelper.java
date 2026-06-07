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
import java.util.Map;

import org.apache.commons.io.IOUtils;
import org.pentaho.platform.api.importexport.IImportHelper;
import org.pentaho.platform.api.importexport.ImportException;
import org.pentaho.platform.engine.services.solution.SolutionHelper;
import org.pentaho.platform.plugin.services.importer.ImportState;
import org.pentaho.platform.plugin.services.importer.PlatformImportException;
import org.pentaho.platform.api.repository2.unified.IPlatformImportBundle;
import org.pentaho.platform.api.repository2.unified.RepositoryFile;
import org.pentaho.platform.api.scheduler2.IScheduler;
import org.pentaho.platform.api.mimetype.IPlatformMimeResolver;
import org.pentaho.platform.engine.core.system.PentahoSystem;
import org.pentaho.platform.plugin.services.importexport.ComponentConfig;
import org.pentaho.platform.plugin.services.importexport.ExportFileNameEncoder;
import org.pentaho.platform.plugin.services.importer.IPlatformImporter;
import org.pentaho.platform.plugin.services.importer.LocaleFilesProcessor;
import org.pentaho.platform.plugin.services.importer.PentahoPlatformImporter;
import org.pentaho.platform.plugin.services.importer.RepositoryFileImportBundle;
import org.pentaho.platform.plugin.services.importexport.exportManifest.ExportManifest;
import org.pentaho.platform.plugin.services.importexport.ImportSession.ManifestFile;
import org.pentaho.platform.plugin.services.importexport.ImportSource.IRepositoryFileBundle;
import org.pentaho.platform.plugin.services.importexport.ImportExportMetrics;
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

  public boolean shouldExecute( Object config ) {
    if ( config instanceof ComponentConfig ) {
      return ( ( ComponentConfig ) config ).isIncludeContent();
    }
    return false;
  }

  @Override
  public void doImport( Object importArg ) throws ImportException {
    solutionImportHandler = (SolutionImportHandler) importArg;
    ImportState importState = solutionImportHandler.getImportState();
    if ( !shouldExecute( solutionImportHandler.getImportSession().getComponentOverrides() ) ) {
      return;
    }
    try {
      ExportManifest manifest = solutionImportHandler.getImportSession().getManifest();

      if ( manifest == null ) {
        if ( importState.isPerformingRestore() ) {
          solutionImportHandler.getLogger().debug( "Manifest is null - skipping repository files import" );
        }
        return;
      }

      if ( importState.isPerformingRestore() ) {
        solutionImportHandler.getLogger().info( "Starting repository files and folders import..." );
      }

      try {
        importRepositoryFilesAndFolders( manifest, bundle, importState, solutionImportHandler );

        if ( importState.isPerformingRestore() ) {
          solutionImportHandler.getLogger().info( "Successfully completed repository files import" );
        }
      } catch ( IOException e ) {
        if ( importState.isPerformingRestore() ) {
          solutionImportHandler.getLogger().error( "Failed to import repository files and folders: " + e.getMessage() );
          solutionImportHandler.getLogger().debug( "Repository files import error", e );
        }
        throw new ImportException( "Failed to import repository files and folders: " + e.getMessage(), e );
      }
    } catch ( Exception e ) {
      if ( importState.isPerformingRestore() ) {
        solutionImportHandler.getLogger().error( "Repository files import helper error: " + e.getMessage() );
      }
      throw new ImportException( "Repository files import helper failed: " + e.getMessage(), e );
    }
  }

  protected void importRepositoryFilesAndFolders( ExportManifest manifest, IPlatformImportBundle bundle, ImportState importState, SolutionImportHandler solutionImportHandler ) throws IOException {
    if ( importState.isPerformingRestore() ) {
      solutionImportHandler.getLogger().info( Messages.getInstance().getString( "SolutionImportHandler.INFO_START_IMPORT_FILEFOLDER" ) );
      solutionImportHandler.getLogger().info( Messages.getInstance().getString( "SolutionImportHandler.INFO_COUNT_FILEFOLDER", importState.getFiles().size() ) );
    }
    int successfulFilesImportCount = 0;
    String manifestVersion = null;
    if ( manifest != null ) {
      manifestVersion = manifest.getManifestInformation().getManifestVersion();
    }
    RepositoryFileImportBundle importBundle = (RepositoryFileImportBundle) bundle;

    IPlatformMimeResolver mimeResolver = PentahoSystem.get( IPlatformMimeResolver.class );
    LocaleFilesProcessor localeFilesProcessor = new LocaleFilesProcessor();
    IPlatformImporter importer = PentahoSystem.get( IPlatformImporter.class );

    for ( IRepositoryFileBundle fileBundle : importState.getFiles() ) {
      String fileName = fileBundle.getFile().getName();
      String actualFilePath = fileBundle.getPath();
      if ( manifestVersion != null ) {
        fileName = ExportFileNameEncoder.decodeZipFileName( fileName );
        actualFilePath = ExportFileNameEncoder.decodeZipFileName( actualFilePath );
      }
      String repositoryFilePath =
        RepositoryFilenameUtils.concat( PentahoPlatformImporter.computeBundlePath( actualFilePath ), fileName );

      Map<String, RepositoryFileImportBundle.Builder> cachedImports = importState.getCachedImports();
      if ( cachedImports.containsKey( repositoryFilePath ) ) {
        solutionImportHandler.getLogger().debug( "Repository object with path [ " + repositoryFilePath + " ] found in the cache" );
        byte[] bytes = IOUtils.toByteArray( fileBundle.getInputStream() );
        RepositoryFileImportBundle.Builder builder = cachedImports.get( repositoryFilePath );
        builder.input( new ByteArrayInputStream( bytes ) );

        try {
          importer.importFile( solutionImportHandler.build( builder ) );
          if ( importState.isPerformingRestore() ) {
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
        repositoryFilePath = importBundle.getPath();
      } else {
        byte[] bytes = IOUtils.toByteArray( fileBundle.getInputStream() );
        bundleInputStream = new ByteArrayInputStream( bytes );
        // If is locale file store it for later processing.
        if ( localeFilesProcessor.isLocaleFile( fileBundle, importBundle.getPath(), bytes ) ) {
          solutionImportHandler.getLogger().trace( Messages.getInstance()
            .getString( "SolutionImportHandler.SkipLocaleFile", repositoryFilePath ) );
          continue;
        }
        bundleBuilder.input( bundleInputStream );
        bundleBuilder.mime( mimeResolver.resolveMimeForFileName( fileName ));

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

      solutionImportHandler.getImportSession().setCurrentManifestKey( sourcePath );

      bundleBuilder.charSet( bundle.getCharSet() );
      bundleBuilder.overwriteFile( bundle.overwriteInRepository() );
      bundleBuilder.applyAclSettings( bundle.isApplyAclSettings() );
      bundleBuilder.retainOwnership( bundle.isRetainOwnership() );
      bundleBuilder.overwriteAclSettings( bundle.isOverwriteAclSettings() );
      bundleBuilder.acl( solutionImportHandler.getImportSession().processAclForFile( sourcePath ) );
      bundleBuilder.extraMetaData( solutionImportHandler.getImportSession().processExtraMetaDataForFile( sourcePath ) );

      RepositoryFile file = solutionImportHandler.getFile( importBundle, fileBundle );
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
        importer.importFile( platformImportBundle );
        successfulFilesImportCount++;
        if ( importState.isPerformingRestore() ) {
          solutionImportHandler.getLogger().debug( "Successfully restored repository object with path [ " + repositoryFilePath + " ]" );
        }
      } catch ( PlatformImportException e ) {
        if ( importState.isPerformingRestore() ) {
          solutionImportHandler.getLogger().error( Messages.getInstance().getString( "SolutionImportHandler.ERROR_IMPORTING_REPOSITORY_OBJECT", repositoryFilePath, e.getLocalizedMessage() ) );
        }
      }

      if ( bundleInputStream != null ) {
        bundleInputStream.close();
      }
    }

    // Process locale files.
    if ( importState.isPerformingRestore() ) {
      solutionImportHandler.getLogger().info( Messages.getInstance().getString( "SolutionImportHandler.INFO_START_IMPORT_LOCALEFILE" ) );
    }
    int successfulLocaleFilesProcessed = 0;
    try {
      successfulLocaleFilesProcessed = localeFilesProcessor.processLocaleFiles( importer );
    } catch ( PlatformImportException e ) {
      if ( importState.isPerformingRestore() ) {
        solutionImportHandler.getLogger().error( Messages.getInstance().getString( "SolutionImportHandler.ERROR_IMPORTING_LOCALE_FILE", e.getLocalizedMessage() ) );
      }
    } finally {
      if ( importState.isPerformingRestore() ) {
        solutionImportHandler.getLogger().info( Messages.getInstance().getString( "SolutionImportHandler.INFO_END_IMPORT_LOCALEFILE" ) );
      }
    }

    if ( importState.isPerformingRestore() ) {
      solutionImportHandler.getLogger().info( Messages.getInstance().getString(
        "SolutionImportHandler.INFO_SUCCESSFUL_REPOSITORY_IMPORT_COUNT", successfulFilesImportCount
          + successfulLocaleFilesProcessed, importState.getFiles().size() ) );
      solutionImportHandler.getLogger().info( Messages.getInstance().getString( "SolutionImportHandler.INFO_END_IMPORT_FILEFOLDER" ) );
    }
  }


  public void setBundle( IPlatformImportBundle bundle ) {
    this.bundle = bundle;
  }
}
