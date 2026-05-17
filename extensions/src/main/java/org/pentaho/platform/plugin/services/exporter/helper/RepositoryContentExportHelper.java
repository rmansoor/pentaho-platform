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

package org.pentaho.platform.plugin.services.exporter.helper;

import org.pentaho.platform.api.importexport.ExportException;
import org.pentaho.platform.api.importexport.IExportHelper;
import org.pentaho.platform.api.repository2.unified.IUnifiedRepository;
import org.pentaho.platform.api.repository2.unified.RepositoryFile;
import org.pentaho.platform.plugin.services.exporter.PentahoPlatformExporter;
import org.pentaho.platform.plugin.services.importexport.BackupComponentConfig;
import org.pentaho.platform.plugin.services.importexport.ImportExportMetrics;
import org.pentaho.platform.plugin.services.importexport.ImportExportMetrics.Category;
import org.pentaho.platform.plugin.services.messages.Messages;
import org.pentaho.platform.repository2.ClientRepositoryPaths;

import java.io.File;
import java.io.FileNotFoundException;
import java.io.IOException;
import java.util.List;
import java.util.zip.ZipOutputStream;

/**
 * Export helper for repository content (files and folders).
 * Handles conditional export based on backup component configuration.
 */
public class RepositoryContentExportHelper implements IExportHelper {
  
  private PentahoPlatformExporter exporter;
  private IUnifiedRepository repository;
  private BackupComponentConfig componentConfig;

  public RepositoryContentExportHelper( PentahoPlatformExporter exporter, IUnifiedRepository repository ) {
    this.exporter = exporter;
    this.repository = repository;
  }

  @Override
  public String getName() {
    return "RepositoryContentExporter";
  }

  /**
   * Determine if repository content export should be performed.
   */
  public boolean shouldExecute( BackupComponentConfig config ) {
    this.componentConfig = config;
    return config != null && config.isIncludeContent();
  }

  @Override
  public void doExport( Object exportArg ) throws ExportException {
    if ( !shouldExecute( componentConfig ) ) {
      return;
    }

    try {
      RepositoryFile rootFolder = repository.getFile( "/" );
      exportFileContent( rootFolder );
      if ( exporter.getExportMetrics() != null ) {
        exporter.getExportMetrics().recordSuccess( Category.FILES );
      }
    } catch ( Exception e ) {
      if ( exporter.getExportMetrics() != null ) {
        exporter.getExportMetrics().recordFailure( Category.FILES, "repository", e );
      }
      throw new ExportException( "Failed to export repository content: " + e.getMessage(), e );
    }
  }

  /**
   * Export file/folder content from the repository.
   * Refactored to handle folder exports independently with their own metadata.
   * Each folder is exported with its own ownership and ACLs, separate from files.
   * 
   * @param exportRepositoryFile the file or folder to export
   * @throws IOException if I/O error occurs
   * @throws ExportException if export error occurs
   */
  protected void exportFileContent( RepositoryFile exportRepositoryFile ) throws IOException, ExportException {
    exporter.getRepositoryExportLogger().info( Messages.getInstance().getString( "PentahoPlatformExporter.INFO_START_EXPORT_REPOSITORY_OBJECT" ) );
    // get the file path
    String filePath = new File( exporter.getPath() ).getParent();
    if ( filePath == null ) {
      filePath = "/";
    }

    // send a response right away if not found
    if ( exportRepositoryFile == null ) {
      // todo: add to messages.properties
      throw new FileNotFoundException( "JCR file not found: " + exporter.getPath() );
    }

    if ( exportRepositoryFile.isFolder() ) { // Handle recursive export
      exporter.getRepositoryExportLogger().trace( "Repository object [ " + exportRepositoryFile.getName() + "] is a folder" );
      exporter.getExportManifest().getManifestInformation().setRootFolder( exporter.getPath().substring( 0, exporter.getPath().lastIndexOf( "/" ) + 1 ) );

      exporter.getRepositoryExportLogger().debug( "Starting recursive backup of a folder [ " + exportRepositoryFile.getName() + " ]" );
      exportFolderHierarchyWithMetadata( exportRepositoryFile, exporter.getZipOutputStream(), filePath );

    } else {
      exporter.getRepositoryExportLogger().trace( "Repository object [ " + exportRepositoryFile.getName() + "] is a file" );
      exporter.getExportManifest().getManifestInformation().setRootFolder( exporter.getPath().substring( 0, exporter.getPath().lastIndexOf( "/" ) + 1 ) );

      try {
        exporter.getRepositoryExportLogger().debug( "Starting backup of a file [ " + exportRepositoryFile.getName() + " ]" );
        exporter.exportFile( exportRepositoryFile, exporter.getZipOutputStream(), filePath );
      } catch ( ExportException | IOException exception ) {
        exporter.getRepositoryExportLogger().error( Messages.getInstance().getString( "PentahoPlatformExporter.ERROR_EXPORT_REPOSITORY_OBJECT", exportRepositoryFile.getName() ) );
      } finally {
        exporter.getRepositoryExportLogger().debug( "Finished the backup of a file [ " + exportRepositoryFile.getName() + " ]" );
      }
    }
    exporter.getRepositoryExportLogger().info( Messages.getInstance().getString( "PentahoPlatformExporter.INFO_END_EXPORT_REPOSITORY_OBJECT" ) );
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
    List<RepositoryFile> children = repository.getChildren( folder.getId() );
    
    if ( children != null ) {
      for ( RepositoryFile child : children ) {
        if ( child.isFolder() ) {
          // Recursively export subfolders with their own metadata
          // This ensures each folder has independent ownership and ACLs
          try {
            exporter.getRepositoryExportLogger().debug( "Starting backup of subfolder [ " + child.getPath() + " ]" );
            exportFolderHierarchyWithMetadata( child, zos, basePath );
            exporter.getRepositoryExportLogger().debug( "Finished backup of subfolder [ " + child.getPath() + " ]" );
          } catch ( Exception e ) {
            exporter.getRepositoryExportLogger().error( "Error exporting subfolder [ " + child.getPath() + " ]: " + e.getMessage(), e );
            if ( exporter.getExportMetrics() != null ) {
              exporter.getExportMetrics().recordFailure( Category.FILES, child.getPath(), e );
            }
            // Continue with next folder
          }
        } else {
          // Export files
          try {
            exporter.getRepositoryExportLogger().debug( "Starting backup of file [ " + child.getPath() + " ]" );
            exporter.exportFile( child, zos, basePath );
            exporter.getRepositoryExportLogger().debug( "Finished backup of file [ " + child.getPath() + " ]" );
          } catch ( ExportException | IOException e ) {
            exporter.getRepositoryExportLogger().error( "Error exporting file [ " + child.getPath() + " ]: " + e.getMessage(), e );
            if ( exporter.getExportMetrics() != null ) {
              exporter.getExportMetrics().recordFailure( Category.FILES, child.getPath(), e );
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
        exporter.getRepositoryExportLogger().trace( "Skipping root folder from explicit export" );
        return;
      }
      
      // Export folder metadata through the parent class method
      // This handles creating ZIP entry AND capturing ACLs and ownership information
      exportFolderAcls( folder );
      
      exporter.getRepositoryExportLogger().debug( "Successfully exported folder metadata for [ " + folder.getPath() + " ]" );
      
    } catch ( Exception e ) {
      exporter.getRepositoryExportLogger().error( "Error exporting folder metadata for [ " + folder.getPath() + " ]: " + e.getMessage(), e );
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
      exporter.addToManifest( folder );
      
      exporter.getRepositoryExportLogger().trace( "ACLs exported for folder [ " + folder.getPath() + " ]" );
    } catch ( Exception e ) {
      exporter.getRepositoryExportLogger().warn( "Could not export ACLs for folder [ " + folder.getPath() + " ]: " + e.getMessage(), e );
      // Continue - folder will still be exported even if ACLs fail
    }
  }
}
