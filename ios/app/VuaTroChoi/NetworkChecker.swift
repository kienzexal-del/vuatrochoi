import Foundation

enum SteamStatus {
    case checking
    case online(latency: Int)
    case blocked
}

class NetworkChecker: ObservableObject {
    @Published var storeStatus: SteamStatus = .checking
    @Published var communityStatus: SteamStatus = .checking
    
    init() {
        checkAll()
    }
    
    func checkAll() {
        checkStore()
        checkCommunity()
    }
    
    func checkStore() {
        storeStatus = .checking
        guard let url = URL(string: "https://store.steampowered.com") else { return }
        measureLatency(url: url) { status in
            DispatchQueue.main.async {
                self.storeStatus = status
            }
        }
    }
    
    func checkCommunity() {
        communityStatus = .checking
        guard let url = URL(string: "https://steamcommunity.com") else { return }
        measureLatency(url: url) { status in
            DispatchQueue.main.async {
                self.communityStatus = status
            }
        }
    }
    
    private func measureLatency(url: URL, completion: @escaping (SteamStatus) -> Void) {
        var request = URLRequest(url: url)
        request.httpMethod = "HEAD"
        request.timeoutInterval = 4.0
        
        let start = DispatchTime.now()
        let task = URLSession.shared.dataTask(with: request) { _, response, error in
            let end = DispatchTime.now()
            let nanoTime = end.uptimeNanoseconds - start.uptimeNanoseconds
            let ms = Int(Double(nanoTime) / 1_000_000)
            
            if error != nil {
                completion(.blocked)
            } else if let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode < 500 {
                completion(.online(latency: ms))
            } else {
                completion(.blocked)
            }
        }
        task.resume()
    }
}
