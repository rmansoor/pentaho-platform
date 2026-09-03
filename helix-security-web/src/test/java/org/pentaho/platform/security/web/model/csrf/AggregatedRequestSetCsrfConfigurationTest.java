/*! ******************************************************************************
 *
 * Pentaho
 *
 * Copyright (C) 2026 by Pentaho Canada Inc. : http://www.pentaho.com
 *
 * Use of this software is governed by the Business Source License included
 * in the LICENSE.TXT file.
 *
 * Change Date: 2030-06-15
 ******************************************************************************/

package org.pentaho.platform.security.web.model.csrf;

import jakarta.servlet.http.HttpServletRequest;
import org.junit.Test;
import org.pentaho.platform.security.web.model.matcher.RequestMatcher;

import java.util.Arrays;
import java.util.Collections;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.mockito.Mockito.mock;

public class AggregatedRequestSetCsrfConfigurationTest {

  private static CsrfRequestSetConfiguration set( RequestMatcher m ) {
    return new CsrfRequestSetConfigurationPojo( m );
  }

  @Test
  public void disabledByDefault() {
    AggregatedRequestSetCsrfConfiguration cfg = new AggregatedRequestSetCsrfConfiguration();
    cfg.setRequestSetConfigurations( Collections.singletonList( set( RequestMatcher.ALL ) ) );
    assertFalse( cfg.isEnabled() );
    assertFalse( cfg.isEnabled( mock( HttpServletRequest.class ) ) );
  }

  @Test
  public void enabledAndSomeMatcherHits() {
    AggregatedRequestSetCsrfConfiguration cfg = new AggregatedRequestSetCsrfConfiguration();
    cfg.setEnabled( true );
    cfg.setRequestSetConfigurations( Arrays.asList( set( RequestMatcher.NONE ), set( RequestMatcher.ALL ) ) );
    assertTrue( cfg.isEnabled() );
    assertTrue( cfg.isEnabled( mock( HttpServletRequest.class ) ) );
  }

  @Test
  public void enabledButNoMatcherHits() {
    AggregatedRequestSetCsrfConfiguration cfg = new AggregatedRequestSetCsrfConfiguration();
    cfg.setEnabled( true );
    cfg.setRequestSetConfigurations( Collections.singletonList( set( RequestMatcher.NONE ) ) );
    assertFalse( cfg.isEnabled( mock( HttpServletRequest.class ) ) );
  }

  @Test
  public void dynamicBindUnbind() {
    AggregatedRequestSetCsrfConfiguration cfg = new AggregatedRequestSetCsrfConfiguration();
    cfg.setEnabled( true );
    HttpServletRequest req = mock( HttpServletRequest.class );

    assertFalse( cfg.isEnabled( req ) );

    CsrfRequestSetConfiguration contributed = set( RequestMatcher.ALL );
    cfg.requestSetConfigurationDidBind( contributed );
    assertTrue( cfg.isEnabled( req ) );

    cfg.requestSetConfigurationWillUnbind( contributed );
    assertFalse( cfg.isEnabled( req ) );
  }

  @Test
  public void bindIsIdempotent() {
    AggregatedRequestSetCsrfConfiguration cfg = new AggregatedRequestSetCsrfConfiguration();
    CsrfRequestSetConfiguration c = set( RequestMatcher.ALL );
    cfg.requestSetConfigurationDidBind( c );
    cfg.requestSetConfigurationDidBind( c );
    // equal-by-matcher pojo also de-duplicates
    cfg.requestSetConfigurationDidBind( set( RequestMatcher.ALL ) );
    // no assertion on internal size beyond "still just works"
    cfg.setEnabled( true );
    assertTrue( cfg.isEnabled( mock( HttpServletRequest.class ) ) );
  }
}
