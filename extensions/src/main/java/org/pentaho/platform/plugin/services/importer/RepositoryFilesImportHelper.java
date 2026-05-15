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

package org.pentaho.platform.plugin.services.importer;

import java.io.IOException;

import org.pentaho.platform.api.importexport.IImportHelper;
import org.pentaho.platform.api.importexport.ImportException;
import org.pentaho.platform.api.repository.RepositoryException;
import org.pentaho.platform.api.repository2.unified.IPlatformImportBundle;
import org.pentaho.platform.plugin.services.importexport.exportManifest.ExportManifest;

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
    // 2. There are files in the manifest (for dependencies like schedule inputs)
    if ( componentOverrides == null ) {
      return true; // Full restore, include content
    }

    // Cast to BackupComponentConfig if available
    if ( componentOverrides instanceof org.pentaho.platform.plugin.services.importexport.BackupComponentConfig ) {
      org.pentaho.platform.plugin.services.importexport.BackupComponentConfig config =
          (org.pentaho.platform.plugin.services.importexport.BackupComponentConfig) componentOverrides;

      // Include if content is explicitly requested
      if ( config.isIncludeContent() ) {
        return true;
      }

      // Also include if there are manifest files (for helper dependencies)
      ExportManifest manifest = null;
      try {
        manifest = solutionImportHandler.getImportSession().getManifest();
      } catch ( Exception e ) {
        // If we can't access manifest, default to include
        return true;
      }

      boolean hasFilesInManifest = manifest != null && manifest.getExportManifestEntities() != null
          && !manifest.getExportManifestEntities().isEmpty();

      return hasFilesInManifest;
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
        solutionImportHandler.importRepositoryFilesAndFolders( manifest, bundle );

        if ( solutionImportHandler.isPerformingRestore() ) {
          solutionImportHandler.getLogger().info( "Successfully completed repository files import" );
        }
      } catch ( IOException | RepositoryException e ) {
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
   * Set the import bundle for file import operations
   */
  public void setBundle( IPlatformImportBundle bundle ) {
    this.bundle = bundle;
  }
}
