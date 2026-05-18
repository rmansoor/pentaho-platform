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

import org.pentaho.platform.api.engine.IUserRoleListService;
import org.pentaho.platform.api.importexport.ExportException;
import org.pentaho.platform.api.importexport.IExportHelper;
import org.pentaho.platform.api.mt.ITenant;
import org.pentaho.platform.api.usersettings.IAnyUserSettingService;
import org.pentaho.platform.api.usersettings.IUserSettingService;
import org.pentaho.platform.api.usersettings.pojo.IUserSetting;
import org.pentaho.platform.engine.core.system.PentahoSystem;
import org.pentaho.platform.engine.core.system.TenantUtils;
import org.pentaho.platform.plugin.services.exporter.PentahoPlatformExporter;
import org.pentaho.platform.plugin.services.importexport.BackupComponentConfig;
import org.pentaho.platform.plugin.services.importexport.ExportManifestUserSetting;
import org.pentaho.platform.plugin.services.importexport.ImportExportMetrics;
import org.pentaho.platform.plugin.services.importexport.RoleExport;
import org.pentaho.platform.plugin.services.importexport.UserExport;
import org.pentaho.platform.plugin.services.messages.Messages;
import org.pentaho.platform.security.policy.rolebased.IRoleAuthorizationPolicyRoleBindingDao;
import org.springframework.security.core.userdetails.UserDetailsService;

import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * Export helper for users and roles.
 * Contains all user and role export logic, including:
 * - User export with settings
 * - Role export with permissions
 * - Schedule owner selective export
 */
public class UsersAndRolesExportHelper implements IExportHelper {
  private PentahoPlatformExporter exporter;
  private IUserSettingService userSettingService;

  public UsersAndRolesExportHelper( PentahoPlatformExporter exporter ) {
    this.exporter = exporter;
  }

  @Override
  public String getName() {
    return "UsersAndRolesExporter";
  }

  public boolean shouldExecute( BackupComponentConfig config ) {
    return config != null && config.isIncludeUsers();
  }

  @Override
  public void doExport( Object exportArg ) throws ExportException {
    BackupComponentConfig config = exporter != null ? exporter.getComponentConfig() : null;
    if ( !shouldExecute( config ) ) {
      return;
    }
    
    try {
      exportUsersAndRoles();
      if ( exporter.getExportMetrics() != null ) {
        exporter.getExportMetrics().recordSuccess( ImportExportMetrics.Category.USERS );
      }
    } catch ( Exception e ) {
      if ( exporter.getExportMetrics() != null ) {
        exporter.getExportMetrics().recordFailure( ImportExportMetrics.Category.USERS, "users", e );
      }
      throw new ExportException( "Failed to export users and roles: " + e.getMessage(), e );
    }
  }

  /**
   * Export all users and their roles
   */
  protected void exportUsersAndRoles() {
    exporter.getRepositoryExportLogger().info( Messages.getInstance().getString( "PentahoPlatformExporter.INFO_START_EXPORT_USER" ) );
    int successfulExportUsers = 0;
    int usersSize = 0;

    IUserRoleListService userRoleListService = PentahoSystem.get( IUserRoleListService.class );
    ITenant tenant = TenantUtils.getCurrentTenant();

    // User Export
    List<String> userList = userRoleListService.getAllUsers( tenant );
    if ( userList != null ) {
      usersSize = userList.size();
      exporter.getRepositoryExportLogger().info( Messages.getInstance().getString( "PentahoPlatformExporter.INFO_COUNT_USER_TO_EXPORT", usersSize ) );
      if ( exporter.getMetricsCollector() != null ) {
        exporter.getMetricsCollector().addUsers( usersSize );
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
      exporter.getRepositoryExportLogger().debug( "Starting backup of global user settings" );
      List<IUserSetting> globalUserSettings = service.getGlobalUserSettings();
      if ( globalUserSettings != null ) {
        for ( IUserSetting setting : globalUserSettings ) {
          exporter.getExportManifest().addGlobalUserSetting( new ExportManifestUserSetting( setting ) );
        }
      }
      exporter.getRepositoryExportLogger().debug( "Finished backup of global user settings" );
    }
    exporter.getRepositoryExportLogger().info( Messages.getInstance().getString( "PentahoPlatformExporter.INFO_SUCCESSFUL_USER_EXPORT_COUNT", successfulExportUsers, usersSize ) );

    exporter.getRepositoryExportLogger().info( Messages.getInstance().getString( "PentahoPlatformExporter.INFO_END_EXPORT_USER" ) );

    // Export roles
    exportRoles();
  }

  /**
   * Export a single user and their roles.
   * Public method to allow external callers (e.g., SchedulerExportHelper, IPentahoPlatformExporter stub)
   * to export individual users as dependencies.
   * 
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
      exporter.getRepositoryExportLogger().debug( "Starting backup of user [ " + username + " ] " );
      UserExport userExport = new UserExport();
      userExport.setUsername( username );
      userExport.setPassword( userDetailsService.loadUserByUsername( username ).getPassword() );

      for ( String role : userRoleListService.getRolesForUser( tenant, username ) ) {
        exporter.getRepositoryExportLogger().trace( "user [ " + username + " ] has an associated role [ " + role + " ]" );
        userExport.setRole( role );
      }

      if ( service != null && service instanceof IAnyUserSettingService ) {
        exporter.getRepositoryExportLogger().debug( "Starting backup of user specific settings for user [ " + username + " ] " );
        IAnyUserSettingService userSettings = (IAnyUserSettingService) service;
        List<IUserSetting> settings = userSettings.getUserSettings( username );
        if ( settings != null ) {
          for ( IUserSetting setting : settings ) {
            try {
              exporter.getRepositoryExportLogger().debug( "Adding user specific setting [ "
                  + setting.getSettingName() + " ] with value [ " + setting.getSettingValue() + " ] to backup" );
              userExport.addUserSetting( new ExportManifestUserSetting( setting ) );
              exporter.getRepositoryExportLogger().debug( "Successfully added user specific setting [ "
                  + setting.getSettingName() + " ] with value [ " + setting.getSettingValue() + " ] to backup" );
            } catch ( Exception e ) {
              exporter.getRepositoryExportLogger().warn( "Failed to export user setting [ " + setting.getSettingName() + " ] for user [ " + username + " ]: " + e.getMessage() );
              // Continue with next setting
            }
          }
        }
        exporter.getRepositoryExportLogger().debug( "Finished backup of user specific settings for user [ " + username + " ] " );
      }

      exporter.getExportManifest().addUserExport( userExport );
      if ( exporter.getExportMetrics() != null ) {
        exporter.getExportMetrics().recordSuccess( ImportExportMetrics.Category.USERS );
      }
      exporter.getRepositoryExportLogger().debug( "Successfully perform backup of user [ " + username + " ] " );
      return true;
    } catch ( Exception e ) {
      exporter.getRepositoryExportLogger().error( "Failed to export user [ " + username + " ]: " + e.getMessage(), e );
      if ( exporter.getExportMetrics() != null ) {
        exporter.getExportMetrics().recordFailure( ImportExportMetrics.Category.USERS, username, e );
      }
      return false;
    }
  }

  /**
   * Export all roles in the system
   */
  protected void exportRoles() {
    exporter.getRepositoryExportLogger().info( Messages.getInstance().getString( "PentahoPlatformExporter.INFO_START_EXPORT_ROLE" ) );
    int successfulExportRoles = 0;
    int rolesSize = 0;

    IUserRoleListService userRoleListService = PentahoSystem.get( IUserRoleListService.class );
    IRoleAuthorizationPolicyRoleBindingDao roleBindingDao = PentahoSystem.get(
        IRoleAuthorizationPolicyRoleBindingDao.class );

    // RoleExport
    List<String> roles = userRoleListService.getAllRoles();
    if ( roles != null ) {
      rolesSize = roles.size();
      exporter.getRepositoryExportLogger().info( Messages.getInstance().getString( "PentahoPlatformExporter.INFO_COUNT_ROLE_TO_EXPORT", rolesSize ) );
      if ( exporter.getMetricsCollector() != null ) {
        exporter.getMetricsCollector().addRoles( rolesSize );
      }
    }
    for ( String role : roles ) {
      try {
        exporter.getRepositoryExportLogger().debug( "Starting backup of role [ " + role + " ] " );
        RoleExport roleExport = new RoleExport();
        roleExport.setRolename( role );
        roleExport.setPermission( roleBindingDao.getRoleBindingStruct( null ).bindingMap.get( role ) );
        exporter.getExportManifest().addRoleExport( roleExport );
        successfulExportRoles++;
        if ( exporter.getExportMetrics() != null ) {
          exporter.getExportMetrics().recordSuccess( ImportExportMetrics.Category.ROLES );
        }
        exporter.getRepositoryExportLogger().debug( "Finished backup of role [ " + role + " ] " );
      } catch ( Exception e ) {
        exporter.getRepositoryExportLogger().error( "Failed to export role [ " + role + " ]: " + e.getMessage(), e );
        if ( exporter.getExportMetrics() != null ) {
          exporter.getExportMetrics().recordFailure( ImportExportMetrics.Category.ROLES, role, e );
        }
        // Continue with next role
      }
    }
    exporter.getRepositoryExportLogger().info( Messages.getInstance().getString( "PentahoPlatformExporter.INFO_SUCCESSFUL_ROLE_EXPORT_COUNT", successfulExportRoles, rolesSize ) );

    exporter.getRepositoryExportLogger().info( Messages.getInstance().getString( "PentahoPlatformExporter.INFO_END_EXPORT_ROLE" ) );
  }

  /**
   * Export only selected users and their roles (used by plugins like scheduler to export dependencies)
   * @param selectedUsernames Set of usernames to export
   */
  public void exportScheduleOwnersAndRoles( Set<String> selectedUsernames ) {
    if ( selectedUsernames == null || selectedUsernames.isEmpty() ) {
      return;
    }

    exporter.getRepositoryExportLogger().info( "Exporting schedule owner users" );
    int successfulExportUsers = 0;

    IUserRoleListService userRoleListService = PentahoSystem.get( IUserRoleListService.class );
    UserDetailsService userDetailsService = PentahoSystem.get( UserDetailsService.class );
    IRoleAuthorizationPolicyRoleBindingDao roleBindingDao = PentahoSystem.get(
        IRoleAuthorizationPolicyRoleBindingDao.class );
    ITenant tenant = TenantUtils.getCurrentTenant();

    if ( userRoleListService == null || userDetailsService == null ) {
      exporter.getRepositoryExportLogger().warn( "Could not export schedule owners: UserRoleListService or UserDetailsService not available" );
      return;
    }

    // Export only the selected users
    Set<String> exportedRoles = new HashSet<>();
    for ( String username : selectedUsernames ) {
      try {
        exporter.getRepositoryExportLogger().debug( "Exporting schedule owner user [ " + username + " ]" );
        UserExport userExport = new UserExport();
        userExport.setUsername( username );

        try {
          userExport.setPassword( userDetailsService.loadUserByUsername( username ).getPassword() );
        } catch ( Exception e ) {
          exporter.getRepositoryExportLogger().warn( "Could not load password for user [ " + username + " ]: " + e.getMessage() );
          // Continue - user will still be exported without password
        }

        // Add the user's roles
        for ( String role : userRoleListService.getRolesForUser( tenant, username ) ) {
          exporter.getRepositoryExportLogger().trace( "Schedule owner [ " + username + " ] has role [ " + role + " ]" );
          userExport.setRole( role );
          exportedRoles.add( role );
        }

        exporter.getExportManifest().addUserExport( userExport );
        successfulExportUsers++;
        if ( exporter.getExportMetrics() != null ) {
          exporter.getExportMetrics().recordSuccess( ImportExportMetrics.Category.USERS );
        }
        exporter.getRepositoryExportLogger().debug( "Successfully exported schedule owner user [ " + username + " ]" );
      } catch ( Exception e ) {
        exporter.getRepositoryExportLogger().warn( "Failed to export schedule owner user [ " + username + " ]: " + e.getMessage(), e );
        if ( exporter.getExportMetrics() != null ) {
          exporter.getExportMetrics().recordFailure( ImportExportMetrics.Category.USERS, username, e );
        }
        // Continue with next user
      }
    }

    // Export only the roles referenced by the selected users
    for ( String role : exportedRoles ) {
      try {
        exporter.getRepositoryExportLogger().debug( "Exporting role [ " + role + " ] for schedule owners" );
        RoleExport roleExport = new RoleExport();
        roleExport.setRolename( role );
        if ( roleBindingDao != null ) {
          roleExport.setPermission( roleBindingDao.getRoleBindingStruct( null ).bindingMap.get( role ) );
        }
        exporter.getExportManifest().addRoleExport( roleExport );
        if ( exporter.getExportMetrics() != null ) {
          exporter.getExportMetrics().recordSuccess( ImportExportMetrics.Category.ROLES );
        }
        exporter.getRepositoryExportLogger().debug( "Successfully exported role [ " + role + " ]" );
      } catch ( Exception e ) {
        exporter.getRepositoryExportLogger().warn( "Failed to export role [ " + role + " ]: " + e.getMessage(), e );
        if ( exporter.getExportMetrics() != null ) {
          exporter.getExportMetrics().recordFailure( ImportExportMetrics.Category.ROLES, role, e );
        }
        // Continue with next role
      }
    }

    exporter.getRepositoryExportLogger().info( "Successfully exported " + successfulExportUsers + " schedule owner users" );
  }

  public IUserSettingService getUserSettingService() {
    if ( userSettingService == null ) {
      userSettingService = PentahoSystem.get( IUserSettingService.class, exporter.getPublicSession() );
    }
    return userSettingService;
  }

  public void setUserSettingService( IUserSettingService userSettingService ) {
    this.userSettingService = userSettingService;
  }
}
