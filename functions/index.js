/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

/**
 * Triggered every time a new document is added to the 'incidents' collection.
 * If the incident type is 'fire' or 'flood', it sends a broadcast push notification.
 */
exports.sendEventAlert = functions.firestore
  .document('incidents/{incidentId}')
  .onCreate(async (snapshot, context) => {
    const event = snapshot.data();
    
    // Only alert for high-priority hazards
    if (event.type === 'fire' || event.type === 'flood') {
      const payload = {
        notification: {
          title: `EMERGENCY: ${event.type.toUpperCase()} REPORTED`,
          body: event.description,
          icon: 'https://cdn-icons-png.flaticon.com/512/564/564619.png',
          clickAction: 'https://your-app-url.run.app'
        },
        topic: 'disaster_alerts'
      };

      try {
        await admin.messaging().send(payload);
        console.log('Notification sent successfully');
      } catch (error) {
        console.error('Error sending notification:', error);
      }
    }
    
    return null;
  });
