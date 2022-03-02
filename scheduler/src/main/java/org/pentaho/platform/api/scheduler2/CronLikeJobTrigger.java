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
 * Copyright (c) 2002-2018 Hitachi Vantara. All rights reserved.
 *
 */

package org.pentaho.platform.api.scheduler2;

import java.io.Serializable;
import java.util.Calendar;
import java.util.Date;
import java.util.GregorianCalendar;
import javax.xml.bind.annotation.XmlRootElement;
import com.cronutils.builder.CronBuilder;
import com.cronutils.model.Cron;
import com.cronutils.model.CronType;
import com.cronutils.model.definition.CronDefinitionBuilder;
import com.cronutils.model.field.value.SpecialChar;

import static com.cronutils.model.field.expression.FieldExpressionFactory.*;

/**
 * A unique scenario to handle day light savigs time
 *
 */
@XmlRootElement
public class CronLikeJobTrigger extends JobTrigger implements Serializable {
    private static final long serialVersionUID = 7838270781497116178L;
    public static final int REPEAT_INDEFINITELY = -1;
    private int repeatCount = 0;
    private long repeatInterval = 0;

    private String cronString = "";

    public CronLikeJobTrigger( Date startTime, Date endTime, int repeatCount, long repeatIntervalSeconds ) {
        super( startTime, endTime );
        this.repeatCount = repeatCount;
        this.repeatInterval = repeatIntervalSeconds;
        this.cronString = generateCronString(repeatInterval, startTime);
    }

    public CronLikeJobTrigger() {
    }

    public String getCronString() {
        if(cronString == null || cronString.isEmpty()) generateCronString(repeatInterval, getStartTime());
        return cronString;
    }

    public int getRepeatCount() {
        return repeatCount;
    }

    public void setRepeatCount( int repeatCount ) {
        this.repeatCount = repeatCount;
    }

    public long getRepeatInterval() {
        return repeatInterval;
    }

    public void setRepeatInterval( long repeatIntervalSeconds ) {
        this.repeatInterval = repeatIntervalSeconds;
    }

    @Override
    public String toString() {
        StringBuilder b = new StringBuilder();
        b.append( "repeatCount=" ); //$NON-NLS-1$
        b.append( repeatCount );
        b.append( ", " ); //$NON-NLS-1$
        b.append( "repeatInterval=" ); //$NON-NLS-1$
        b.append( repeatInterval );
        b.append( ", " ); //$NON-NLS-1$
        b.append( "startTime=" ); //$NON-NLS-1$
        b.append( super.getStartTime() );
        b.append( ", " ); //$NON-NLS-1$
        b.append( "endTime=" ); //$NON-NLS-1$
        b.append( super.getEndTime() );
        return b.toString();
    }

    private static String generateCronString(long interval, Date startDate) {
        Calendar calendar = GregorianCalendar.getInstance(); // creates a new calendar instance
        calendar.setTime(startDate);
        int hour = calendar.get(Calendar.HOUR_OF_DAY);
        int minute = calendar.get(Calendar.MINUTE);

        Cron cron = CronBuilder.cron(CronDefinitionBuilder.instanceDefinitionFor(CronType.QUARTZ))
                .withYear(always())
                .withDoM(every((int)interval))
                .withMonth(always())
                .withDoW(questionMark())
                .withHour(on(hour))
                .withMinute(on(minute))
                .withSecond(on(0)).instance();
        return cron.asString();
    }
}
