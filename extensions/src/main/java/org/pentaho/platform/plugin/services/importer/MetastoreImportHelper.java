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

import org.pentaho.platform.api.importexport.IImportHelper;
import org.pentaho.platform.api.importexport.ImportException;
import org.pentaho.platform.plugin.services.importexport.exportManifest.ExportManifest;

/**
 * Import helper for metastore restoration.
 * Handles importing metastore data from backup.
 *
 * Profile: METASTORE
 * Filters: isIncludeMetastore()
 */
public class MetastoreImportHelper implements IImportHelper {

  private SolutionImportHandler solutionImportHandler;
  private boolean overwriteFile = false;

  @Override
  public String getName() {
    return "Metastore Import Helper";
  }

  @Override
  public boolean shouldExecute( Object componentOverrides ) {
    // Only execute if metastore is included in the profile
    if ( componentOverrides == null ) {
      return true; // Full restore, include metastore
    }

    // Cast to BackupComponentConfig if available
    if ( componentOverrides instanceof org.pentaho.platform.plugin.services.importexport.BackupComponentConfig ) {
      org.pentaho.platform.plugin.services.importexport.BackupComponentConfig config =
          (org.pentaho.platform.plugin.services.importexport.BackupComponentConfig) componentOverrides;
      return config.isIncludeMetastore();
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
          solutionImportHandler.getLogger().debug( "Manifest is null - skipping metastore import" );
        }
        return;
      }

      if ( solutionImportHandler.isPerformingRestore() ) {
        solutionImportHandler.getLogger().info( "Starting metastore import..." );
      }

      try {
        solutionImportHandler.importMetaStore( manifest.getMetaStore(), overwriteFile );

        if ( solutionImportHandler.isPerformingRestore() ) {
          solutionImportHandler.getLogger().info( "Successfully completed metastore import" );
        }
      } catch ( Exception e ) {
        if ( solutionImportHandler.isPerformingRestore() ) {
          solutionImportHandler.getLogger().error( "Failed to import metastore: " + e.getMessage() );
          solutionImportHandler.getLogger().debug( "Metastore import error", e );
        }
        throw new ImportException( "Failed to import metastore: " + e.getMessage(), e );
      }
    } catch ( Exception e ) {
      if ( solutionImportHandler.isPerformingRestore() ) {
        solutionImportHandler.getLogger().error( "Metastore import helper error: " + e.getMessage() );
      }
      throw new ImportException( "Metastore import helper failed: " + e.getMessage(), e );
    }
  }

  /**
   * Set whether to overwrite existing metastore files
   */
  public void setOverwriteFile( boolean overwriteFile ) {
    this.overwriteFile = overwriteFile;
  }
}
