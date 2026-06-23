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


package org.pentaho.platform.plugin.services.importer.helper;

import org.apache.commons.logging.Log;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.mockito.ArgumentMatchers;
import org.pentaho.platform.api.mt.ITenant;
import org.pentaho.platform.engine.core.system.PentahoSystem;
import org.pentaho.platform.plugin.services.importer.SolutionImportHandler;
import org.pentaho.platform.plugin.services.importexport.RoleExport;
import org.pentaho.platform.security.policy.rolebased.IRoleAuthorizationPolicyRoleBindingDao;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

public class UsersAndRolesImportHelperTest {

  private UsersAndRolesImportHelper helper;
  private IRoleAuthorizationPolicyRoleBindingDao roleBindingDao;
  private SolutionImportHandler handler;
  private Log logger;

  @Before
  public void setUp() {
    helper = new UsersAndRolesImportHelper();
    roleBindingDao = mock( IRoleAuthorizationPolicyRoleBindingDao.class );
    PentahoSystem.registerObject( roleBindingDao );

    handler = mock( SolutionImportHandler.class );
    logger = mock( Log.class );
    when( handler.getLogger() ).thenReturn( logger );
  }

  @After
  public void tearDown() {
    PentahoSystem.clearObjectFactory();
  }

  @Test
  public void testImportRoleBindings_restoresRuntimeToLogicalMapping() {
    // External-auth case: only the runtime-role -> logical-role mapping is restored, via
    // setRoleBindings. No users or role memberships are created.
    List<String> role1Logical = Arrays.asList( "org.pentaho.repository.read", "org.pentaho.repository.create" );
    List<String> role2Logical = Arrays.asList( "org.pentaho.repository.execute" );

    RoleExport role1 = new RoleExport();
    role1.setRolename( "role1" );
    role1.setPermission( role1Logical );

    RoleExport role2 = new RoleExport();
    role2.setRolename( "role2" );
    role2.setPermission( role2Logical );

    List<RoleExport> roles = new ArrayList<>();
    roles.add( role1 );
    roles.add( role2 );

    helper.importRoleBindings( roles, handler );

    verify( roleBindingDao ).setRoleBindings( ArgumentMatchers.any( ITenant.class ),
      ArgumentMatchers.eq( "role1" ), ArgumentMatchers.eq( role1Logical ) );
    verify( roleBindingDao ).setRoleBindings( ArgumentMatchers.any( ITenant.class ),
      ArgumentMatchers.eq( "role2" ), ArgumentMatchers.eq( role2Logical ) );
  }

  @Test
  public void testImportRoleBindings_nullRolesDoesNothing() {
    helper.importRoleBindings( null, handler );

    verify( roleBindingDao, never() ).setRoleBindings( ArgumentMatchers.any( ITenant.class ),
      ArgumentMatchers.anyString(), ArgumentMatchers.anyList() );
  }

  @Test
  public void testImportRoleBindings_continuesAfterFailure() {
    // A failure restoring one role must not stop the remaining roles from being restored.
    RoleExport role1 = new RoleExport();
    role1.setRolename( "bad" );
    role1.setPermission( new ArrayList<>() );

    RoleExport role2 = new RoleExport();
    role2.setRolename( "good" );
    List<String> goodLogical = Arrays.asList( "org.pentaho.repository.read" );
    role2.setPermission( goodLogical );

    List<RoleExport> roles = new ArrayList<>();
    roles.add( role1 );
    roles.add( role2 );

    doThrowOnSetRoleBindings( "bad" );

    helper.importRoleBindings( roles, handler );

    verify( roleBindingDao ).setRoleBindings( ArgumentMatchers.any( ITenant.class ),
      ArgumentMatchers.eq( "good" ), ArgumentMatchers.eq( goodLogical ) );
  }

  private void doThrowOnSetRoleBindings( String roleName ) {
    org.mockito.Mockito.doThrow( new RuntimeException( "boom" ) ).when( roleBindingDao )
      .setRoleBindings( ArgumentMatchers.any( ITenant.class ), ArgumentMatchers.eq( roleName ),
        ArgumentMatchers.anyList() );
  }
}
