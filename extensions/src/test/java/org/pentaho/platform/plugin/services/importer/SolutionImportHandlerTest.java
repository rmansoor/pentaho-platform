/*!
 *
 * This program is free software; you can redistribute it and/or modify it under the
 * terms of the GNU Lesser General Public License, version 2.1 as published by the Free Software
 * Foundation.
 *
 * You should have received a copy of the GNU Lesser General Public License along with this
 * program; if not, you can obtain a copy at http://www.gnu.org/licenses/old-licenses/lgpl-2.1.html
 * or from the Free Software Foundation, Inc.,
 * 51 Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA.
 *
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY;
 * without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 * See the GNU Lesser General Public License for more details.
 *
 *
 * Copyright (c) 2002-2021 Hitachi Vantara. All rights reserved.
 *
 */

package org.pentaho.platform.plugin.services.importer;

import org.apache.commons.io.FilenameUtils;
import org.apache.commons.logging.Log;
import org.junit.After;
import org.junit.Assert;
import org.junit.Before;
import org.junit.Test;
import org.mockito.ArgumentMatcher;
import org.mockito.MockedStatic;
import org.mockito.Mockito;
import org.pentaho.platform.api.engine.IAuthorizationPolicy;
import org.pentaho.platform.api.engine.IPentahoSession;
import org.pentaho.platform.api.engine.security.userroledao.AlreadyExistsException;
import org.pentaho.platform.api.engine.security.userroledao.IUserRoleDao;
import org.pentaho.platform.api.mimetype.IMimeType;
import org.pentaho.platform.api.mimetype.IPlatformMimeResolver;
import org.pentaho.platform.api.mt.ITenant;
import org.pentaho.platform.api.repository2.unified.IUnifiedRepository;
import org.pentaho.platform.api.repository2.unified.RepositoryFile;
import org.pentaho.platform.api.usersettings.IAnyUserSettingService;
import org.pentaho.platform.api.usersettings.IUserSettingService;
import org.pentaho.platform.api.usersettings.pojo.IUserSetting;
import org.pentaho.platform.engine.core.system.PentahoSessionHolder;
import org.pentaho.platform.engine.core.system.PentahoSystem;
import org.pentaho.platform.plugin.services.importexport.ExportManifestUserSetting;
import org.pentaho.platform.plugin.services.importexport.ImportSession;
import org.pentaho.platform.plugin.services.importexport.ImportSession.ManifestFile;
import org.pentaho.platform.plugin.services.importexport.ImportSource.IRepositoryFileBundle;
import org.pentaho.platform.plugin.services.importexport.RepositoryFileBundle;
import org.pentaho.platform.plugin.services.importexport.RoleExport;
import org.pentaho.platform.plugin.services.importexport.UserExport;
import org.pentaho.platform.plugin.services.importexport.exportManifest.ExportManifest;
import org.pentaho.platform.plugin.services.importexport.exportManifest.bindings.ExportManifestMetaStore;
import org.pentaho.platform.security.policy.rolebased.IRoleAuthorizationPolicyRoleBindingDao;

import javax.ws.rs.core.Response;
import java.io.File;
import java.io.IOException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.mockito.Mockito.any;
import static org.mockito.Mockito.anyString;
import static org.mockito.Mockito.argThat;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.nullable;
import static org.mockito.Mockito.spy;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;


public class SolutionImportHandlerTest {

  private SolutionImportHandler importHandler;
  private UserRoleSolutionImportHandler userRoleSolutionImportHandler;
  private MetastoreSolutionImportHandler metastoreSolutionImportHandler;

  private IUserRoleDao userRoleDao;
  private IUnifiedRepository repository;
  private IRoleAuthorizationPolicyRoleBindingDao roleAuthorizationPolicyRoleBindingDao;
  private IPlatformMimeResolver mockMimeResolver;

  @Before
  public void setUp() throws Exception {
    userRoleDao = mockToPentahoSystem( IUserRoleDao.class );
    repository = mockToPentahoSystem( IUnifiedRepository.class );
    roleAuthorizationPolicyRoleBindingDao = mockToPentahoSystem( IRoleAuthorizationPolicyRoleBindingDao.class );

    List<IMimeType> mimeTypes = new ArrayList<>();
    try ( MockedStatic<PentahoSystem> pentahoSystemMockedStatic = Mockito.mockStatic( PentahoSystem.class ) ) {
      mockMimeResolver = mock( IPlatformMimeResolver.class );
      pentahoSystemMockedStatic.when( () -> PentahoSystem.get( IPlatformMimeResolver.class ) )
        .thenReturn( mockMimeResolver );
      importHandler = spy( new SolutionImportHandler( mimeTypes ) );
      userRoleSolutionImportHandler = spy( new UserRoleSolutionImportHandler( "UserRole" ) );
      Map<String, RepositoryFileImportBundle.Builder> cachedImports = new HashMap<>();
      metastoreSolutionImportHandler = spy( new MetastoreSolutionImportHandler( "Metastore" ,cachedImports ) );
    }

    when( importHandler.getImportSession() ).thenReturn( mock( ImportSession.class ) );
    when( importHandler.getLogger() ).thenReturn( mock( Log.class ) );
  }

  private <T> T mockToPentahoSystem( Class<T> cl ) {
    T t = mock( cl );
    PentahoSystem.registerObject( t );
    return t;
  }

  @Test
  public void testImportUsers_oneUserManyRoles() {
    List<UserExport> users = new ArrayList<>();
    UserExport user = new UserExport();
    user.setUsername( "scrum master" );
    user.setRole( "coder" );
    user.setRole( "product owner" );
    user.setRole( "cat herder" );
    user.setPassword( "password" );
    users.add( user );
    Map<String, List<String>> rolesToUsers = userRoleSolutionImportHandler
            .importUsers(users, null, true);

    Assert.assertEquals( 3, rolesToUsers.size() );
    Assert.assertEquals( "scrum master", rolesToUsers.get( "coder" ).get( 0 ) );
    Assert.assertEquals( "scrum master", rolesToUsers.get( "product owner" ).get( 0 ) );
    Assert.assertEquals( "scrum master", rolesToUsers.get( "cat herder" ).get( 0 ) );

    String[] strings = {};

    verify( userRoleDao ).createUser(
      any( ITenant.class ),
      eq( "scrum master" ),
      nullable( String.class ),
      nullable( String.class ),
      any( strings.getClass() ) );

    // should not set the password or roles explicitly if the createUser worked
    verify( userRoleDao, never() )
      .setUserRoles( any( ITenant.class ), nullable( String.class ), any( strings.getClass() ) );
    verify( userRoleDao, never() )
      .setPassword( any( ITenant.class ), nullable( String.class ), nullable( String.class ) );
  }

  @Test
  public void testImportUsers_manyUserManyRoles() {
    List<UserExport> users = new ArrayList<>();
    UserExport user = new UserExport();
    user.setUsername( "scrum master" );
    user.setRole( "coder" );
    user.setRole( "product owner" );
    user.setRole( "cat herder" );
    user.setPassword( "password" );
    users.add( user );

    UserExport user2 = new UserExport();
    user2.setUsername( "the dude" );
    user2.setRole( "coder" );
    user2.setRole( "awesome" );
    user2.setPassword( "password" );
    users.add( user2 );

    Map<String, List<String>> rolesToUsers = userRoleSolutionImportHandler
            .importUsers(users, null, true);
    Assert.assertEquals( 4, rolesToUsers.size() );
    Assert.assertEquals( 2, rolesToUsers.get( "coder" ).size() );
    Assert.assertEquals( 1, rolesToUsers.get( "product owner" ).size() );
    Assert.assertEquals( "scrum master", rolesToUsers.get( "product owner" ).get( 0 ) );
    Assert.assertEquals( 1, rolesToUsers.get( "cat herder" ).size() );
    Assert.assertEquals( "scrum master", rolesToUsers.get( "cat herder" ).get( 0 ) );
    Assert.assertEquals( 1, rolesToUsers.get( "awesome" ).size() );
    Assert.assertEquals( "the dude", rolesToUsers.get( "awesome" ).get( 0 ) );

    String[] strings = {};

    verify( userRoleDao ).createUser(
      any( ITenant.class ),
      eq( "scrum master" ),
      nullable( String.class ),
      nullable( String.class ),
      any( strings.getClass() ) );

    verify( userRoleDao ).createUser(
      any( ITenant.class ),
      eq( "the dude" ),
      nullable( String.class ),
      nullable( String.class ),
      any( strings.getClass() ) );

    // should not set the password or roles explicitly if the createUser worked
    verify( userRoleDao, never() )
      .setUserRoles( any( ITenant.class ), nullable( String.class ), any( strings.getClass() ) );
    verify( userRoleDao, never() )
      .setPassword( any( ITenant.class ), nullable( String.class ), nullable( String.class ) );
  }

  @Test
  public void testImportUsers_userAlreadyExists() {
    List<UserExport> users = new ArrayList<>();
    UserExport user = new UserExport();
    user.setUsername( "scrum master" );
    user.setRole( "coder" );
    user.setPassword( "password" );
    users.add( user );
    String[] strings = {};

    when( userRoleDao.createUser(
      any( ITenant.class ),
      eq( "scrum master" ),
      nullable( String.class ),
      nullable( String.class ),
      any( strings.getClass() ) ) ).thenThrow( new AlreadyExistsException( "already there" ) );

    importHandler.setOverwriteFile( true );
    Map<String, List<String>> rolesToUsers = userRoleSolutionImportHandler
            .importUsers(users, null, true);

    Assert.assertEquals( 1, rolesToUsers.size() );
    Assert.assertEquals( "scrum master", rolesToUsers.get( "coder" ).get( 0 ) );

    verify( userRoleDao ).createUser(
      any( ITenant.class ),
      eq( "scrum master" ),
      nullable( String.class ),
      nullable( String.class ),
      any( strings.getClass() ) );

    // should set the password or roles explicitly if the createUser failed
    verify( userRoleDao )
      .setUserRoles( any( ITenant.class ), nullable( String.class ), any( strings.getClass() ) );
    verify( userRoleDao ).setPassword( any( ITenant.class ), nullable( String.class ), nullable( String.class ) );
  }

  @Test
  public void testImportUsers_userAlreadyExists_overwriteFalse() {
    List<UserExport> users = new ArrayList<>();
    UserExport user = new UserExport();
    user.setUsername( "scrum master" );
    user.setRole( "coder" );
    user.setPassword( "password" );
    users.add( user );
    String[] strings = {};

    when( userRoleDao.createUser(
      any( ITenant.class ),
      eq( "scrum master" ),
      nullable( String.class ),
      nullable( String.class ),
      any( strings.getClass() ) ) ).thenThrow( new AlreadyExistsException( "already there" ) );

    importHandler.setOverwriteFile( false );
    Map<String, List<String>> rolesToUsers = userRoleSolutionImportHandler
            .importUsers(users, null, true);

    Assert.assertEquals( 1, rolesToUsers.size() );
    Assert.assertEquals( "scrum master", rolesToUsers.get( "coder" ).get( 0 ) );

    verify( userRoleDao ).createUser(
      any( ITenant.class ),
      eq( "scrum master" ),
      nullable( String.class ),
      nullable( String.class ),
      any( strings.getClass() ) );

    // should set the password or roles explicitly if the createUser failed
    verify( userRoleDao, never() )
      .setUserRoles( any( ITenant.class ), nullable( String.class ), any( strings.getClass() ) );
    verify( userRoleDao, never() )
      .setPassword( any( ITenant.class ), nullable( String.class ), nullable( String.class ) );
  }

  @Test
  public void testImportRoles() {
    String roleName = "ADMIN";
    List<String> permissions = new ArrayList<>();

    RoleExport role = new RoleExport();
    role.setRolename( roleName );
    role.setPermission( permissions );

    List<RoleExport> roles = new ArrayList<>();
    roles.add( role );

    Map<String, List<String>> roleToUserMap = new HashMap<>();
    final List<String> adminUsers = new ArrayList<>();
    adminUsers.add( "admin" );
    adminUsers.add( "root" );
    roleToUserMap.put( roleName, adminUsers );

    String[] userStrings = adminUsers.toArray( new String[] {} );
    userRoleSolutionImportHandler.importRoles(roles, roleToUserMap, null, true);

    verify( userRoleDao ).createRole( any( ITenant.class ), eq( roleName ), nullable( String.class ),
      any( userStrings.getClass() ) );
    verify( roleAuthorizationPolicyRoleBindingDao )
      .setRoleBindings( any( ITenant.class ), eq( roleName ),
        eq( permissions ) );
  }

  @Test
  public void testImportRoles_roleAlreadyExists() {
    String roleName = "ADMIN";
    List<String> permissions = new ArrayList<>();

    RoleExport role = new RoleExport();
    role.setRolename( roleName );
    role.setPermission( permissions );

    List<RoleExport> roles = new ArrayList<>();
    roles.add( role );

    Map<String, List<String>> roleToUserMap = new HashMap<>();
    final List<String> adminUsers = new ArrayList<>();
    adminUsers.add( "admin" );
    adminUsers.add( "root" );
    roleToUserMap.put( roleName, adminUsers );

    String[] userStrings = adminUsers.toArray( new String[] {} );

    when( userRoleDao.createRole( any( ITenant.class ), nullable( String.class ), nullable( String.class ),
      any( userStrings.getClass() ) ) )
      .thenThrow( new AlreadyExistsException( "already there" ) );

    importHandler.setOverwriteFile( true );
    userRoleSolutionImportHandler.importRoles(roles, roleToUserMap, null, true);

    verify( userRoleDao ).createRole( any( ITenant.class ), nullable( String.class ), nullable( String.class ),
      any( userStrings.getClass() ) );

    // even if the roles exists, make sure we set the permissions on it Mockito.anyway... they might have changed
    verify( roleAuthorizationPolicyRoleBindingDao )
      .setRoleBindings( any( ITenant.class ), eq( roleName ), eq(
        permissions ) );

  }

  @Test
  public void testImportRoles_roleAlreadyExists_overwriteFalse() {
    String roleName = "ADMIN";
    List<String> permissions = new ArrayList<>();

    RoleExport role = new RoleExport();
    role.setRolename( roleName );
    role.setPermission( permissions );

    List<RoleExport> roles = new ArrayList<>();
    roles.add( role );

    Map<String, List<String>> roleToUserMap = new HashMap<>();
    final List<String> adminUsers = new ArrayList<>();
    adminUsers.add( "admin" );
    adminUsers.add( "root" );
    roleToUserMap.put( roleName, adminUsers );

    String[] userStrings = adminUsers.toArray( new String[] {} );

    when( userRoleDao.createRole( any( ITenant.class ), nullable( String.class ), nullable( String.class ),
      any( userStrings.getClass() ) ) )
      .thenThrow( new AlreadyExistsException( "already there" ) );

    importHandler.setOverwriteFile( false );
    userRoleSolutionImportHandler.importRoles(roles, roleToUserMap, null, true);

    verify( userRoleDao ).createRole( any( ITenant.class ), nullable( String.class ), nullable( String.class ),
      any( userStrings.getClass() ) );

    // even if the roles exists, make sure we set the permissions on it Mockito.anyway... they might have changed
    verify( roleAuthorizationPolicyRoleBindingDao, never() )
      .setRoleBindings( any( ITenant.class ), eq( roleName ), eq(
        permissions ) );

  }

  @Test
  public void testImportMetaStore() {
    String path = "/path/to/file.zip";
    ExportManifestMetaStore manifestMetaStore = new ExportManifestMetaStore( path,
      "metastore",
      "description of the metastore" );
    importHandler.cachedImports = new HashMap<>();

    importHandler.importMetaStore( manifestMetaStore, true );
    Assert.assertEquals( 1, importHandler.cachedImports.size() );
    Assert.assertNotNull( importHandler.cachedImports.get( path ) );
  }

  @Test
  public void testImportMetaStore_nullMetastoreManifest() {
    ExportManifest manifest = spy( new ExportManifest() );

    importHandler.cachedImports = new HashMap<>();
    importHandler.importMetaStore( manifest.getMetaStore(), true );
    Assert.assertEquals( 0, importHandler.cachedImports.size() );
  }

  @Test
  public void testImportUserSettings() throws Exception {
    UserExport user = new UserExport();
    user.setUsername( "pentaho" );
    user.addUserSetting( new ExportManifestUserSetting( "theme", "crystal" ) );
    user.addUserSetting( new ExportManifestUserSetting( "language", "en_US" ) );
    IAnyUserSettingService userSettingService = mock( IAnyUserSettingService.class );
    PentahoSystem.registerObject( userSettingService );
    importHandler.setOverwriteFile( true );

    importHandler.importUserSettings( user );
    verify( userSettingService ).setUserSetting( "pentaho", "theme", "crystal" );
    verify( userSettingService ).setUserSetting( "pentaho", "language", "en_US" );
  }

  @Test
  public void testImportUserSettings_NoOverwrite() {
    UserExport user = new UserExport();
    user.setUsername( "pentaho" );
    user.addUserSetting( new ExportManifestUserSetting( "theme", "crystal" ) );
    user.addUserSetting( new ExportManifestUserSetting( "language", "en_US" ) );
    IAnyUserSettingService userSettingService = mock( IAnyUserSettingService.class );
    PentahoSystem.registerObject( userSettingService );
    importHandler.setOverwriteFile( false );

    IUserSetting existingSetting = mock( IUserSetting.class );
    when( userSettingService.getUserSetting( "pentaho", "theme", null ) ).thenReturn( existingSetting );
    when( userSettingService.getUserSetting( "pentaho", "language", null ) ).thenReturn( null );

    importHandler.importUserSettings( user );
    verify( userSettingService, never() ).setUserSetting( "pentaho", "theme", "crystal" );
    verify( userSettingService ).setUserSetting( "pentaho", "language", "en_US" );
    verify( userSettingService ).getUserSetting( "pentaho", "theme", null );
    verify( userSettingService ).getUserSetting( "pentaho", "language", null );
  }

  @Test
  public void testImportGlobalUserSetting() {
    importHandler.setOverwriteFile( true );
    List<ExportManifestUserSetting> settings = new ArrayList<>();
    settings.add( new ExportManifestUserSetting( "language", "en_US" ) );
    settings.add( new ExportManifestUserSetting( "showHiddenFiles", "false" ) );
    IUserSettingService userSettingService = mock( IUserSettingService.class );
    PentahoSystem.registerObject( userSettingService );

    importHandler.importGlobalUserSettings( settings );

    verify( userSettingService ).setGlobalUserSetting( "language", "en_US" );
    verify( userSettingService ).setGlobalUserSetting( "showHiddenFiles", "false" );
    verify( userSettingService, never() )
      .getGlobalUserSetting( nullable( String.class ), nullable( String.class ) );
  }

  @Test
  public void testImportGlobalUserSetting_noOverwrite() {
    importHandler.setOverwriteFile( false );
    List<ExportManifestUserSetting> settings = new ArrayList<>();
    settings.add( new ExportManifestUserSetting( "language", "en_US" ) );
    settings.add( new ExportManifestUserSetting( "showHiddenFiles", "false" ) );
    IUserSettingService userSettingService = mock( IUserSettingService.class );
    PentahoSystem.registerObject( userSettingService );
    IUserSetting setting = mock( IUserSetting.class );
    when( userSettingService.getGlobalUserSetting( "language", null ) ).thenReturn( null );
    when( userSettingService.getGlobalUserSetting( "showHiddenFiles", null ) ).thenReturn( setting );

    importHandler.importGlobalUserSettings( settings );

    verify( userSettingService ).setGlobalUserSetting( "language", "en_US" );
    verify( userSettingService, never() )
      .setGlobalUserSetting( eq( "showHiddenFiles" ), nullable( String.class ) );
    verify( userSettingService ).getGlobalUserSetting( "language", null );
    verify( userSettingService ).getGlobalUserSetting( "showHiddenFiles", null );

  }

  }