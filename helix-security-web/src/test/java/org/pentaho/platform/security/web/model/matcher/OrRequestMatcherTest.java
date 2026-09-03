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

package org.pentaho.platform.security.web.model.matcher;

import jakarta.servlet.http.HttpServletRequest;
import org.junit.Test;

import java.util.Arrays;
import java.util.Collections;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.mockito.Mockito.mock;

public class OrRequestMatcherTest {

  @Test
  public void emptyMatchesNothing() {
    assertFalse( new OrRequestMatcher( Collections.emptyList() ).test( mock( HttpServletRequest.class ) ) );
    assertFalse( new OrRequestMatcher( null ).test( mock( HttpServletRequest.class ) ) );
  }

  @Test
  public void anyDelegateMatching() {
    assertTrue( new OrRequestMatcher( Arrays.asList( RequestMatcher.NONE, RequestMatcher.ALL ) )
      .test( mock( HttpServletRequest.class ) ) );
  }

  @Test
  public void noDelegateMatching() {
    assertFalse( new OrRequestMatcher( Arrays.asList( RequestMatcher.NONE, RequestMatcher.NONE ) )
      .test( mock( HttpServletRequest.class ) ) );
  }
}
