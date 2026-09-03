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

package org.pentaho.platform.security.web.model.cors;

import jakarta.servlet.http.HttpServletRequest;

/**
 * Aggregated CORS configuration for the server.
 * <p>
 * Clean-room replacement for {@code com.hitachivantara.security.web.model.cors.CorsConfiguration}.
 */
public interface CorsConfiguration {

  default boolean isEnabled() {
    CorsRequestSetConfiguration root = getRootConfiguration();
    return root != null && root.isEnabled();
  }

  CorsRequestSetConfiguration getRootConfiguration();

  /**
   * The effective configuration for this request &mdash; the first non-abstract set whose matcher
   * hits, with defaults inherited up the parent chain &mdash; or {@code null} if none applies.
   */
  CorsRequestSetConfiguration getRequestConfiguration( HttpServletRequest request );
}
