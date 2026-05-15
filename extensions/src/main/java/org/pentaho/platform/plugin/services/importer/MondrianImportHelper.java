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
 * Import helper for Mondrian OLAP schema restoration.
 * Handles importing Mondrian cube definitions and OLAP schemas from backup.
 *
 * Profile: MONDRIAN
 * Filters: isIncludeMondrian()
 */
public class MondrianImportHelper implements IImportHelper {

  private SolutionImportHandler solutionImportHandler;

  @Override
  public String getName() {
    return "Mondrian OLAP Schema Import Helper";
  }

  @Override
  public boolean shouldExecute( Object componentOverrides ) {
    // Only execute if Mondrian schemas are included in the profile
    if ( componentOverrides == null ) {
      return true; // Full restore, include Mondrian
    }

    // Cast to BackupComponentConfig if available
    if ( componentOverrides instanceof org.pentaho.platform.plugin.services.importexport.BackupComponentConfig ) {
      org.pentaho.platform.plugin.services.importexport.BackupComponentConfig config =
          (org.pentaho.platform.plugin.services.importexport.BackupComponentConfig) componentOverrides;
      return config.isIncludeMondrian();
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
          solutionImportHandler.getLogger().debug( "Manifest is null - skipping Mondrian import" );
        }
        return;
      }

      if ( solutionImportHandler.isPerformingRestore() ) {
        solutionImportHandler.getLogger().info( "Starting Mondrian OLAP schema import..." );
      }

      try {
        solutionImportHandler.importMondrian( manifest.getMondrianList() );

        if ( solutionImportHandler.isPerformingRestore() ) {
          solutionImportHandler.getLogger().info( "Successfully completed Mondrian import" );
        }
      } catch ( Exception e ) {
        if ( solutionImportHandler.isPerformingRestore() ) {
          solutionImportHandler.getLogger().error( "Failed to import Mondrian schemas: " + e.getMessage() );
          solutionImportHandler.getLogger().debug( "Mondrian import error", e );
        }
        throw new ImportException( "Failed to import Mondrian schemas: " + e.getMessage(), e );
      }
    } catch ( Exception e ) {
      if ( solutionImportHandler.isPerformingRestore() ) {
        solutionImportHandler.getLogger().error( "Mondrian import helper error: " + e.getMessage() );
      }
      throw new ImportException( "Mondrian import helper failed: " + e.getMessage(), e );
    }
  }
}
