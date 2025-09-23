//
//  Item.swift
//  macro
//
//  Created by Douglasrag A/L Elangovan on 23/9/25.
//

import Foundation
import SwiftData

@Model
final class Item {
    var timestamp: Date
    
    init(timestamp: Date) {
        self.timestamp = timestamp
    }
}
