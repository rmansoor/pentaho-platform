package org.pentaho.platform.plugin.services.importer;

import org.pentaho.platform.api.engine.security.userroledao.AlreadyExistsException;
import org.pentaho.platform.api.engine.security.userroledao.IPentahoRole;
import org.pentaho.platform.api.engine.security.userroledao.IUserRoleDao;
import org.pentaho.platform.api.mt.ITenant;
import org.pentaho.platform.api.repository2.unified.IPlatformImportBundle;
import org.pentaho.platform.api.usersettings.IAnyUserSettingService;
import org.pentaho.platform.api.usersettings.IUserSettingService;
import org.pentaho.platform.api.usersettings.pojo.IUserSetting;
import org.pentaho.platform.core.mt.Tenant;
import org.pentaho.platform.engine.core.system.PentahoSystem;
import org.pentaho.platform.engine.core.system.TenantUtils;
import org.pentaho.platform.plugin.services.importexport.ExportManifestUserSetting;
import org.pentaho.platform.plugin.services.importexport.RoleExport;
import org.pentaho.platform.plugin.services.importexport.UserExport;
import org.pentaho.platform.plugin.services.importexport.exportManifest.ExportManifest;
import org.pentaho.platform.plugin.services.messages.Messages;
import org.pentaho.platform.security.policy.rolebased.IRoleAuthorizationPolicyRoleBindingDao;
import org.apache.commons.logging.Log;
import java.util.*;

public class UserRoleSolutionImportHandler implements ISolutionComponentImportHandler {
    String componentName;

    UserRoleSolutionImportHandler( String componentName ) {
        this.componentName = componentName;
    }
    @Override
    public void importComponent(ExportManifest manifest, Log logger, IPlatformImportBundle bundle ) {
        // import the users
        Map<String, List<String>> roleToUserMap = importUsers( manifest.getUserExports(), logger, bundle.overwriteInRepository() );

        // import the roles
        importRoles( manifest.getRoleExports(), roleToUserMap, logger, bundle.overwriteInRepository() );
    }

    @Override
    public String getComponentName() {
        return componentName;
    }

    protected void importRoles(List<RoleExport> roles, Map<String, List<String>> roleToUserMap, Log logger, boolean overwrite ) {
        if ( roles != null ) {
            IUserRoleDao roleDao = PentahoSystem.get( IUserRoleDao.class );
            ITenant tenant = new Tenant( "/pentaho/" + TenantUtils.getDefaultTenant(), true );
            IRoleAuthorizationPolicyRoleBindingDao roleBindingDao = PentahoSystem.get(
                    IRoleAuthorizationPolicyRoleBindingDao.class );

            Set<String> existingRoles = new HashSet<>();

            for ( RoleExport role : roles ) {
                logger.debug( Messages.getInstance().getString( "ROLE.importing", role.getRolename() ) );
                try {
                    List<String> users = roleToUserMap.get( role.getRolename() );
                    String[] userarray = users == null ? new String[] {} : users.toArray( new String[] {} );
                    IPentahoRole role1 = roleDao.createRole( tenant, role.getRolename(), null, userarray );
                } catch ( AlreadyExistsException e ) {
                    existingRoles.add( role.getRolename() );
                    // it's ok if the role already exists, it is probably a default role
                    logger.info( Messages.getInstance().getString( "ROLE.Already.Exists", role.getRolename() ) );
                }
                try {
                    if ( existingRoles.contains( role.getRolename() ) ) {
                        //Only update an existing role if the overwrite flag is set
                        if ( overwrite ) {
                            roleBindingDao.setRoleBindings( tenant, role.getRolename(), role.getPermissions() );
                        }
                    } else {
                        //Always write a roles permissions that were not previously existing
                        roleBindingDao.setRoleBindings( tenant, role.getRolename(), role.getPermissions() );
                    }
                } catch ( Exception e ) {
                    logger.info( Messages.getInstance()
                            .getString( "ERROR.SettingRolePermissions", role.getRolename() ), e );
                }
            }
        }
    }

    /**
     * Imports UserExport objects into the platform as users.
     *
     * @param users
     * @return A map of role names to list of users in that role
     */
    protected Map<String, List<String>> importUsers( List<UserExport> users, Log logger, boolean overwrite ) {
        Map<String, List<String>> roleToUserMap = new HashMap<>();
        IUserRoleDao roleDao = PentahoSystem.get( IUserRoleDao.class );
        ITenant tenant = new Tenant( "/pentaho/" + TenantUtils.getDefaultTenant(), true );

        if ( users != null && roleDao != null ) {
            for ( UserExport user : users ) {
                String password = user.getPassword();
                logger.debug( Messages.getInstance().getString( "USER.importing", user.getUsername() ) );

                // map the user to the roles he/she is in
                for ( String role : user.getRoles() ) {
                    List<String> userList;
                    if ( !roleToUserMap.containsKey( role ) ) {
                        userList = new ArrayList<>();
                        roleToUserMap.put( role, userList );
                    } else {
                        userList = roleToUserMap.get( role );
                    }
                    userList.add( user.getUsername() );
                }

                String[] userRoles = user.getRoles().toArray( new String[] {} );
                try {
                    roleDao.createUser( tenant, user.getUsername(), password, null, userRoles );
                } catch ( AlreadyExistsException e ) {
                    // it's ok if the user already exists, it is probably a default user
                    logger.info( Messages.getInstance().getString( "USER.Already.Exists", user.getUsername() ) );

                    try {
                        if ( overwrite ) {
                            // set the roles, maybe they changed
                            roleDao.setUserRoles( tenant, user.getUsername(), userRoles );

                            // set the password just in case it changed
                            roleDao.setPassword( tenant, user.getUsername(), password );
                        }
                    } catch ( Exception ex ) {
                        // couldn't set the roles or password either
                        logger.debug( Messages.getInstance()
                                .getString( "ERROR.OverridingExistingUser", user.getUsername() ), ex );
                    }
                } catch ( Exception e ) {
                    logger.error( Messages.getInstance()
                            .getString( "ERROR.OverridingExistingUser", user.getUsername() ), e );
                }
                importUserSettings( user, logger, overwrite );
            }
        }
        return roleToUserMap;
    }

    protected void importUserSettings( UserExport user, Log logger, boolean overwrite ) {
        IUserSettingService settingService = PentahoSystem.get( IUserSettingService.class );
        IAnyUserSettingService userSettingService = null;
        if ( settingService != null && settingService instanceof IAnyUserSettingService ) {
            userSettingService = (IAnyUserSettingService) settingService;
        }

        if ( userSettingService != null ) {
            List<ExportManifestUserSetting> exportedSettings = user.getUserSettings();
            try {
                for ( ExportManifestUserSetting exportedSetting : exportedSettings ) {
                    if ( overwrite ) {
                        userSettingService.setUserSetting( user.getUsername(),
                                exportedSetting.getName(), exportedSetting.getValue() );
                    } else {
                        // see if it's there first before we set this setting
                        IUserSetting userSetting =
                                userSettingService.getUserSetting( user.getUsername(), exportedSetting.getName(), null );
                        if ( userSetting == null ) {
                            // only set it if we didn't find that it exists already
                            userSettingService.setUserSetting( user.getUsername(),
                                    exportedSetting.getName(), exportedSetting.getValue() );
                        }
                    }
                }
            } catch ( SecurityException e ) {
                String errorMsg = Messages.getInstance().getString( "ERROR.ImportingUserSetting", user.getUsername() );
                logger.error( errorMsg );
                logger.debug( errorMsg, e );
            }
        }
    }

}
